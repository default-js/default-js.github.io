import MarkdownIt from "markdown-it/dist/markdown-it.js";

import HighlightJs from "./HighlightJs.js";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
const TOC_PLACEHOLDER = /^\[\[?toc\]?\]$/i;

const RENDERER = MarkdownIt({
	html: true,
	linkify: true,
	typographer: true,
	highlight: (code, language) => {
		if (language && HighlightJs.getLanguage(language)) {
			try {
				const { value } = HighlightJs.highlight(code, { language, ignoreIllegals: true });
				return `<pre class="hljs"><code class="language-${RENDERER.utils.escapeHtml(language)}">${value}</code></pre>`;
			} catch (e) {
				console.warn(`can't highlight code block of language "${language}"`, e);
			}
		}

		return `<pre class="hljs"><code>${RENDERER.utils.escapeHtml(code)}</code></pre>`;
	},
});

/**
 * Creates a github compatible anchor slug.
 */
const slugify = (text) =>
	text
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s_-]/gu, "")
		.replace(/\s+/g, "-");

const uniqueSlug = (text, used) => {
	const slug = slugify(text) || "section";
	const count = used.get(slug) || 0;
	used.set(slug, count + 1);

	return count === 0 ? slug : `${slug}-${count}`;
};

/**
 * Assigns an id to every heading and adds a permalink, so headings are linkable.
 */
const applyAnchors = (fragment) => {
	const used = new Map();
	const headings = [];

	for (const heading of fragment.querySelectorAll(HEADING_SELECTOR)) {
		const text = heading.textContent.trim();
		const id = heading.getAttribute("id") || uniqueSlug(text, used);
		heading.setAttribute("id", id);

		const permalink = document.createElement("a");
		permalink.classList.add("anchor");
		permalink.setAttribute("href", `#${id}`);
		permalink.setAttribute("aria-hidden", "true");
		heading.append(permalink);

		headings.push({ id, text, level: parseInt(heading.tagName.substring(1), 10) });
	}

	return headings;
};

/**
 * Resolves relative links and image sources against the origin of the markdown file.
 */
const resolveUrls = (fragment, baseurl) => {
	if (!baseurl) return;

	const resolve = (element, attribute) => {
		const value = element.getAttribute(attribute);
		if (!value || value.startsWith("#")) return;

		try {
			element.setAttribute(attribute, new URL(value, baseurl).href);
		} catch (e) {
			console.warn(`can't resolve "${value}" against "${baseurl}"`, e);
		}
	};

	for (const anchor of fragment.querySelectorAll("a[href]")) resolve(anchor, "href");
	for (const image of fragment.querySelectorAll("img[src]")) resolve(image, "src");
};

const buildToc = (headings, { title = null, maxLevel = 6 } = {}) => {
	const nav = document.createElement("nav");
	nav.classList.add("toc");

	if (title) {
		const caption = document.createElement("div");
		caption.classList.add("toc-title");
		caption.textContent = title;
		nav.append(caption);
	}

	const root = document.createElement("ul");
	nav.append(root);

	const stack = [{ level: 0, item: null, list: root }];
	const listOf = (entry) => {
		if (!entry.list) {
			entry.list = document.createElement("ul");
			entry.item.append(entry.list);
		}

		return entry.list;
	};

	for (const heading of headings.filter((heading) => heading.level <= maxLevel)) {
		while (stack.length > 1 && heading.level <= stack[stack.length - 1].level) stack.pop();

		const item = document.createElement("li");
		const link = document.createElement("a");
		link.setAttribute("href", `#${heading.id}`);
		link.textContent = heading.text;
		item.append(link);
		listOf(stack[stack.length - 1]).append(item);

		stack.push({ level: heading.level, item, list: null });
	}

	return nav;
};

/**
 * Replaces a `[[toc]]` placeholder or prepends the table of contents, if requested.
 */
const applyToc = (fragment, headings, { toc, tocTitle, tocMaxLevel }) => {
	const placeholder = Array.from(fragment.querySelectorAll("p")).find((paragraph) => TOC_PLACEHOLDER.test(paragraph.textContent.trim()));

	if (!placeholder && !toc) return;
	if (!headings.length) {
		if (placeholder) placeholder.remove();
		return;
	}

	const nav = buildToc(headings, { title: tocTitle, maxLevel: tocMaxLevel });
	if (placeholder) placeholder.replaceWith(nav);
	else fragment.prepend(nav);
};

/**
 * Compiles markdown into a `DocumentFragment`.
 *
 * @param {string} markdown - the markdown source
 * @param {object} [options]
 * @param {string} [options.baseurl] - origin of the markdown, used to resolve relative links and images
 * @param {boolean} [options.toc] - prepend a table of contents, even without a `[[toc]]` placeholder
 * @param {string} [options.tocTitle] - caption rendered above the table of contents
 * @param {number} [options.tocMaxLevel] - deepest heading level included in the table of contents
 * @returns {DocumentFragment}
 */
export const compile = (markdown, { baseurl = null, toc = false, tocTitle = null, tocMaxLevel = 6 } = {}) => {
	const template = document.createElement("template");
	template.innerHTML = RENDERER.render(markdown);

	const fragment = template.content;
	const headings = applyAnchors(fragment);
	resolveUrls(fragment, baseurl);
	applyToc(fragment, headings, { toc, tocTitle, tocMaxLevel });

	return fragment;
};

/**
 * Loads a markdown file and compiles it into a `DocumentFragment`.
 *
 * @param {string|URL} url - location of the markdown file
 * @param {object} [options] - see {@link compile}, `baseurl` defaults to `url`
 * @returns {Promise<DocumentFragment>}
 */
export const load = async (url, options = {}) => {
	const response = await fetch(url, { headers: { Accept: "text/markdown, text/plain, */*" } });
	if (!response.ok) throw new Error(`can't load markdown from "${url}" - status ${response.status}`);

	const markdown = await response.text();

	return compile(markdown, { baseurl: response.url || url, ...options });
};

export default { compile, load };
