/**
 * Fragt alle oeffentlichen Repositories einer GitHub-Organisation ab und schreibt sie als JSON.
 *
 * Laeuft ohne Authentifizierung und liest ausschliesslich oeffentliche Daten.
 *
 * Aufgenommen werden nur der Default-Branch und die Tags (GitHub-Releases haengen
 * immer an einem Tag). Default-Branch und Tags werden ueber "git ls-remote" aus
 * dem Git-Protokoll gelesen und kosten kein API-Kontingent; die URLs werden lokal zusammengesetzt.
 * Lediglich die Repository-Liste kommt aus der GitHub-API - dafuer gibt es kein
 * Git-Kommando, da "git ls-remote" immer eine konkrete Repository-URL braucht.
 * Das ist 1 Request pro 100 Repositories, anonym stehen 60 Requests/Stunde pro
 * IP zur Verfuegung.
 *
 * Optional hebt die Umgebungsvariable GITHUB_TOKEN das Limit auf 5000
 * Requests/Stunde; fuer oeffentliche Daten genuegt ein Personal Access Token
 * ohne Scopes.
 *
 * Voraussetzung: git muss im PATH liegen.
 *
 * Aufruf:
 *   node build-utils/fetch-org-repositories.js
 *   node build-utils/fetch-org-repositories.js --org default-js --out repositories.json
 *
 * Ausgabe:
 *   {
 *     "repository-name": {
 *       "name": "repository-name",
 *       "main": "master",
 *       "branches": {
 *         "master": {
 *           "url": "https://github.com/<org>/<repo>/tree/master",
 *           "readme": "https://raw.githubusercontent.com/<org>/<repo>/master/README.md",
 *           "package": "https://raw.githubusercontent.com/<org>/<repo>/master/package.json"
 *         },
 *         "2.0.1": {
 *           "url": "https://github.com/<org>/<repo>/tree/2.0.1",
 *           ...
 *         }
 *       }
 *     }
 *   }
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execFileAsync = promisify(execFile);

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const README_FILE = "README.md";
const PACKAGE_FILE = "package.json";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values: args } = parseArgs({
	options: {
		org: { type: "string", default: "default-js" },
		out: { type: "string", default: path.join(projectRoot, "src/pages/docu-app/data/repositories.json") },
	},
});

const getApiHeaders = () => {
	const headers = {
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
		"User-Agent": "fetch-org-repositories",
	};
	if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	return headers;
};

/**
 * Uebersetzt einen fehlgeschlagenen API-Aufruf in eine lesbare Meldung. Ein
 * ausgeschoepftes Rate-Limit meldet GitHub als 403 bzw. 429 mit
 * x-ratelimit-remaining = 0 - ein 403 aus anderem Grund tut das nicht.
 */
const getApiErrorMessage = (response) => {
	const { status, headers } = response;

	if ((status === 403 || status === 429) && headers.get("x-ratelimit-remaining") === "0") {
		const limit = headers.get("x-ratelimit-limit");
		const reset = headers.get("x-ratelimit-reset");
		const resetAt = reset ? new Date(Number(reset) * 1000).toLocaleTimeString("de-DE") : "unbekannt";
		const hint = process.env.GITHUB_TOKEN
			? "Warte auf das Reset oder reduziere die Anzahl der Repositories."
			: "Warte auf das Reset oder setze GITHUB_TOKEN, um auf 5000 Requests/Stunde zu kommen.";

		return `GitHub Rate-Limit ausgeschoepft (${limit} Requests/Stunde), neues Kontingent ab ${resetAt}.\n${hint}`;
	}

	return `GitHub API ${status} : ${response.statusText}`;
};

/**
 * Liest die Repository-Namen seitenweise aus der API, bis eine leere Seite kommt.
 */
const getRepositoryNames = async (organization) => {
	const headers = getApiHeaders();
	const names = [];

	for (let page = 1; ; page++) {
		const response = await fetch(`${API}/orgs/${organization}/repos?type=public&per_page=100&page=${page}`, { headers });
		if (!response.ok) throw new Error(getApiErrorMessage(response));

		const repos = await response.json();
		if (repos.length === 0) break;

		for (const repo of repos) names.push(repo.name);
	}

	return names;
};

/**
 * Liest Default-Branch und Tags eines Repositories ueber git aus.
 *
 * "git ls-remote --symref" liefert zuerst die Aufloesung von HEAD auf den
 * Default-Branch und danach je eine Zeile "<sha><TAB><ref>" pro Tag. Annotierte
 * Tags erscheinen zusaetzlich mit "^{}" (aufgeloester Commit) und werden ignoriert:
 *
 *   ref: refs/heads/master	HEAD
 *   0a84961...	HEAD
 *   753d80b...	refs/tags/2.0.0
 *   1f3c2a9...	refs/tags/2.0.0^{}
 *
 * Tags werden absteigend nach Version sortiert (neueste zuerst).
 *
 * Liefert null, wenn das Repository nicht lesbar ist.
 */
const getRepositoryRefs = async (organization, repository) => {
	const url = `https://github.com/${organization}/${repository}.git`;

	let stdout;
	try {
		// GIT_TERMINAL_PROMPT=0 verhindert, dass git bei einem nicht erreichbaren
		// Repository nach Zugangsdaten fragt und das Script haengen bleibt.
		({ stdout } = await execFileAsync("git", ["ls-remote", "--symref", url, "HEAD", "refs/tags/*"], {
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
		}));
	} catch {
		return null;
	}

	let main = null;
	const tags = [];

	for (const line of stdout.split(/\r?\n/)) {
		let match = line.match(/^ref:\s+refs\/heads\/(.+?)\s+HEAD$/);
		if (match) {
			main = match[1];
			continue;
		}
		match = line.match(/^[0-9a-f]+\s+refs\/tags\/(.+)$/);
		if (match && !match[1].endsWith("^{}")) tags.push(match[1]);
	}

	tags.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

	return { main, tags };
};

/**
 * Baut den JSON-Eintrag eines Repositories: Default-Branch und Tags mit je drei
 * URLs unter "branches" (diesen Schluessel liest die Docu-App). Die URLs werden
 * konstruiert, nicht auf Existenz geprueft - ein Ref ohne README.md oder
 * package.json bekommt trotzdem einen Eintrag.
 */
const createRepositoryEntry = (organization, repository, refs) => {
	const branches = {};
	const names = refs.main ? [refs.main, ...refs.tags] : refs.tags;

	for (const name of names) {
		branches[name] = {
			url: `https://github.com/${organization}/${repository}/tree/${name}`,
			readme: `${RAW}/${organization}/${repository}/${name}/${README_FILE}`,
			package: `${RAW}/${organization}/${repository}/${name}/${PACKAGE_FILE}`,
		};
	}

	return {
		name: repository,
		main: refs.main,
		branches,
	};
};

// --- Ablauf ---------------------------------------------------------------

const main = async ({ org, out }) => {
	console.log(`Lade Repositories der Organisation "${org}" ...`);
	const repoNames = (await getRepositoryNames(org)).sort((a, b) => a.localeCompare(b));

	if (repoNames.length === 0) throw new Error(`Keine oeffentlichen Repositories fuer "${org}" gefunden.`);

	console.log(`${repoNames.length} Repositories gefunden, lade Default-Branch und Tags:`);

	const allRefs = await Promise.all(repoNames.map((name) => getRepositoryRefs(org, name)));
	const result = {};

	repoNames.forEach((name, index) => {
		const refs = allRefs[index];

		// Fehlschlaege einzelner Repositories brechen den Gesamtlauf nicht ab.
		if (refs == null) {
			console.log(`  uebersprungen (nicht lesbar): ${name}`);
			return;
		}

		// Repository ohne Commits: kein HEAD, keine Tags.
		console.log(refs.main == null ? `  leer: ${name}` : `  ${name} (${refs.tags.length} Tags)`);

		result[name] = createRepositoryEntry(org, name, refs);
	});

	const outFile = path.resolve(out);
	await writeFile(outFile, JSON.stringify(result, null, "\t") + "\n", "utf8");

	console.log(`Geschrieben nach ${outFile}`);
};

main(args).catch((error) => {
	console.error(error.message);
	process.exit(1);
});
