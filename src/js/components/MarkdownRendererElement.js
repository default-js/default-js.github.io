import { Component, define } from "@default-js/defaultjs-html-components";
import MarkdownIt, {utils} from "markdown-it";

import HighlightJs from "../HighlightJs";

const NODENAME = "x-markdown-renderer";
const ATTR_SRC = "src";

const RENDERER = MarkdownIt({
	linkify: false,
	typographer: true,
	highlight: (str, lang) => {
        console.log( {lang})
		if (lang && HighlightJs.getLanguage(lang)) {
			try {
				return `<pre class="hljs"><code>${HighlightJs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
			} catch (__) {}
		}

		return `<pre class="hljs"><code>${utils.escapeHtml(str)}</code></pre>`;
	}
});

class MarkdownRenderElement extends Component {
	static get NODENAME() {
		return NODENAME;
	}

	#rendered = false;

	constructor() {
		super();
	}

	async init() {
		await super.init();
		if (!this.#rendered) {
			const src = this.attr(ATTR_SRC);
			let markdown = await fetch(src);
			markdown = await markdown.text();
			markdown = await RENDERER.render(MarkdownIt.utils.escapeHtml(markdown));
			const content = create(markdown);
			const anchors = content.find(`a[id^="user-content" i]`);
			for (const anchor of anchors) {
				const href = anchor.attr("href").replace("#", "");
				if (href) anchor.attr("id", href);
			}

			this.root.append(content);

			this.#rendered = true;
		}
	}
}

define(MarkdownRenderElement);
