import { writeFile } from "fs/promises";
import hljs from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import shell from "highlight.js/lib/languages/shell";
import MarkdownIt from "markdown-it";
import repos from "./repos.js";

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('shell', shell);

const markdown = MarkdownIt({
	html: true,
	highlight: function (str, lang) {
		if (lang && hljs.getLanguage(lang)) {
			try {
				return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
			} catch (__) {}
		}
		return '<pre><code class="hljs" language-${lang}>' + markdown.utils.escapeHtml(str) + "</code></pre>";
	},
});

const getMarkdownData = async (repo) => {
	const url = `https://raw.githubusercontent.com/default-js/${repo.name}/${repo.branch}/README.md`;
	const response = await fetch(url);
	if (response.status != 200) throw new Error(`can't download file from "${url}"`);
	return response.text();
};

const downloadMarkdownFile = async (repo, { dest }) => {
	try {
		const mdfile = await getMarkdownData(repo);
		const rendered = await markdown.render(mdfile);
		
		await writeFile(`${dest}/${repo.name}.html`, `<div jstl-ignore>${rendered}</div>`, "utf-8");
	} catch (e) {
		console.error(e.message);
	}
};

const downloadMarkdownFiles = async ({ dest }) => {
	const promises = repos.map((repo) => downloadMarkdownFile(repo, { dest }));
	await Promise.all(promises);
};

export default async (entry) => {
	await downloadMarkdownFiles({ dest: `./src/pages/${entry.name}/static` });
};
