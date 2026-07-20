<#
.SYNOPSIS
	Fragt alle oeffentlichen Repositories einer GitHub-Organisation ab und schreibt sie als JSON.

.DESCRIPTION
	Laeuft ohne Authentifizierung und liest ausschliesslich oeffentliche Daten.

	Default-Branch und Branches werden ueber "git ls-remote" aus dem Git-Protokoll
	gelesen und kosten kein API-Kontingent; die URLs werden lokal zusammengesetzt.
	Lediglich die Repository-Liste kommt aus der GitHub-API - dafuer gibt es kein
	Git-Kommando, da "git ls-remote" immer eine konkrete Repository-URL braucht.
	Das ist 1 Request pro 100 Repositories, anonym stehen 60 Requests/Stunde pro
	IP zur Verfuegung.

	Optional hebt die Umgebungsvariable GITHUB_TOKEN das Limit auf 5000
	Requests/Stunde; fuer oeffentliche Daten genuegt ein Personal Access Token
	ohne Scopes.

	Voraussetzung: git muss im PATH liegen.

.PARAMETER Org
	Name der GitHub-Organisation.

.PARAMETER OutFile
	Zieldatei fuer die JSON-Ausgabe.

.EXAMPLE
	.\build-utils\fetch-org-repositories.ps1
	.\build-utils\fetch-org-repositories.ps1 -Org default-js -OutFile repositories.json

.OUTPUTS
	{
	  "repository-name": {
	    "main": "master",
	    "branches": {
	      "master": {
	        "url": "https://github.com/<org>/<repo>/tree/master",
	        "readme": "https://raw.githubusercontent.com/<org>/<repo>/master/README.md",
	        "package": "https://raw.githubusercontent.com/<org>/<repo>/master/package.json"
	      }
	    }
	  }
	}
#>

[CmdletBinding()]
param(
	[string] $Org = 'default-js',
	[string] $OutFile = '../src/pages/docu-app/data/repositories.json'
)

$ErrorActionPreference = 'Stop'

$Api = 'https://api.github.com'
$Raw = 'https://raw.githubusercontent.com'
$ReadmeFile = 'README.md'
$PackageFile = 'package.json'

# Windows PowerShell 5.1 verhandelt sonst noch TLS 1.0, das die GitHub-API ablehnt.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Verhindert, dass git bei einem nicht erreichbaren Repository nach Zugangsdaten
# fragt und das Script haengen bleibt.
$env:GIT_TERMINAL_PROMPT = '0'

function Get-ApiHeaders {
	$headers = @{
		'Accept'               = 'application/vnd.github+json'
		'X-GitHub-Api-Version' = '2022-11-28'
		'User-Agent'           = 'fetch-org-repositories'
	}
	if ($env:GITHUB_TOKEN) {
		$headers['Authorization'] = "Bearer $($env:GITHUB_TOKEN)"
	}
	return $headers
}

<#
	Liest die Repository-Namen seitenweise aus der API, bis eine leere Seite kommt.
#>
function Get-RepositoryName {
	param([string] $Organization)

	$headers = Get-ApiHeaders
	$names = New-Object System.Collections.Generic.List[string]
	$page = 1

	while ($true) {
		$url = "$Api/orgs/$Organization/repos?type=public&per_page=100&page=$page"

		try {
			$response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
		}
		catch {
			throw (Get-ApiErrorMessage $_)
		}

		if (-not $response -or $response.Count -eq 0) { break }

		foreach ($repo in $response) { $names.Add($repo.name) }
		$page++
	}

	return $names
}

<#
	Uebersetzt einen fehlgeschlagenen API-Aufruf in eine lesbare Meldung. Ein
	ausgeschoepftes Rate-Limit meldet GitHub als 403 bzw. 429 mit
	x-ratelimit-remaining = 0 - ein 403 aus anderem Grund tut das nicht.
#>
function Get-ApiErrorMessage {
	param($ErrorRecord)

	$response = $ErrorRecord.Exception.Response
	if (-not $response) { return $ErrorRecord.Exception.Message }

	$status = [int] $response.StatusCode
	$remaining = $response.Headers['x-ratelimit-remaining']

	if (($status -eq 403 -or $status -eq 429) -and $remaining -eq '0') {
		$limit = $response.Headers['x-ratelimit-limit']
		$reset = $response.Headers['x-ratelimit-reset']

		$resetAt = 'unbekannt'
		if ($reset) {
			$resetAt = [DateTimeOffset]::FromUnixTimeSeconds([int64] $reset).LocalDateTime.ToString('HH:mm:ss')
		}

		$hint = if ($env:GITHUB_TOKEN) {
			'Warte auf das Reset oder reduziere die Anzahl der Repositories.'
		}
		else {
			'Warte auf das Reset oder setze GITHUB_TOKEN, um auf 5000 Requests/Stunde zu kommen.'
		}

		return "GitHub Rate-Limit ausgeschoepft ($limit Requests/Stunde), neues Kontingent ab $resetAt.`n$hint"
	}

	return "GitHub API $status : $($ErrorRecord.Exception.Message)"
}

<#
	Liest Default-Branch und Branch-Namen eines Repositories ueber git aus.

	"git ls-remote --symref" liefert zuerst die Aufloesung von HEAD auf den
	Default-Branch und danach je eine Zeile "<sha><TAB><ref>" pro Branch:

	  ref: refs/heads/master	HEAD
	  0a84961...	HEAD
	  0a84961...	refs/heads/master
#>
function Get-RepositoryRef {
	param(
		[string] $Organization,
		[string] $Repository
	)

	$url = "https://github.com/$Organization/$Repository.git"

	# stderr wird verworfen, damit Fortschrittsmeldungen von git die Ausgabe nicht stoeren.
	$output = & git ls-remote --symref $url HEAD 'refs/heads/*' 2>$null

	if ($LASTEXITCODE -ne 0) { return $null }

	$main = $null
	$branches = New-Object System.Collections.Generic.List[string]

	foreach ($line in $output) {
		Write-Host "    $line"
		if ($line -match '^ref:\s+refs/heads/(.+?)\s+HEAD$') {
			$main = $Matches[1]
			continue
		}
		if ($line -match '^[0-9a-f]+\s+refs\/heads\/(master|main|v?\d+(\.(\d+|x))*)$') {
			$branches.Add($Matches[1])
		}
	}

	return [pscustomobject]@{

		Main     = $main
		Branches = $branches
	}
}

<#
	Baut den JSON-Eintrag eines Repositories: Default-Branch plus je Branch die
	drei URLs. Die URLs werden konstruiert, nicht auf Existenz geprueft - ein
	Branch ohne README.md oder package.json bekommt trotzdem einen Eintrag.
#>
function New-RepositoryEntry {
	param(
		[string] $Organization,
		[string] $Repository,
		$Refs
	)

	$branches = [ordered]@{}

	foreach ($branch in $Refs.Branches) {
		$branches[$branch] = [ordered]@{
			url     = "https://github.com/$Organization/$Repository/tree/$branch"
			readme  = "$Raw/$Organization/$Repository/$branch/$ReadmeFile"
			package = "$Raw/$Organization/$Repository/$branch/$PackageFile"
		}
	}

	return [ordered]@{
		name	 = $Repository
		main     = $Refs.Main
		branches = $branches
	}
}

# --- Ablauf ---------------------------------------------------------------

Write-Host "Lade Repositories der Organisation `"$Org`" ..."
$repoNames = Get-RepositoryName -Organization $Org | Sort-Object

if (-not $repoNames -or $repoNames.Count -eq 0) {
	Write-Error "Keine oeffentlichen Repositories fuer `"$Org`" gefunden."
	exit 1
}

Write-Host "$($repoNames.Count) Repositories gefunden, lade Branches:"

$result = [ordered]@{}

foreach ($name in $repoNames) {
	$refs = Get-RepositoryRef -Organization $Org -Repository $name

	# Fehlschlaege einzelner Repositories brechen den Gesamtlauf nicht ab.
	if ($null -eq $refs) {
		Write-Host "  uebersprungen (nicht lesbar): $name"
		continue
	}

	# Repository ohne Commits: kein HEAD, keine Branches.
	if ($refs.Branches.Count -eq 0) {
		Write-Host "  leer: $name"
	}
	else {
		Write-Host "  $name"
	}

	$result[$name] = New-RepositoryEntry -Organization $Org -Repository $name -Refs $refs
}

$json = $result | ConvertTo-Json -Depth 10

# Bewusst nicht Set-Content -Encoding utf8: Windows PowerShell 5.1 schreibt damit
# ein BOM an den Dateianfang, an dem JSON-Parser scheitern.
# WriteAllText kennt das Arbeitsverzeichnis von PowerShell nicht, daher wird ein
# relativer Pfad hier selbst aufgeloest.
$path = if ([System.IO.Path]::IsPathRooted($OutFile)) {
	$OutFile
}
else {
	Join-Path (Get-Location).Path $OutFile
}
[System.IO.File]::WriteAllText($path, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Geschrieben nach $OutFile"
