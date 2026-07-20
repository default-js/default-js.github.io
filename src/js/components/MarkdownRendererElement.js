import { Component, define } from "@default-js/defaultjs-html-components/index.js";

import { compile, load } from "../markdown/MarkdownCompiler.js";

const NODENAME = "x-markdown-renderer";

const ATTR__ATTACH_TO = "attach-to";
const ATTR_SRC = "src";
const ATTR_TOC = "toc";
const ATTR_TOC_TITLE = "toc-title";
const ATTR_TOC_MAX_LEVEL = "toc-max-level";

const ATTRIBUTES = [ATTR_SRC, ATTR_TOC, ATTR_TOC_TITLE, ATTR_TOC_MAX_LEVEL];

/**
 * Removes the indentation, that inline markdown inherits from the surrounding markup.
 */
const dedent = (markdown) => {
	const lines = markdown.replace(/^[ \t]*\r?\n/, "").trimEnd().split(/\r?\n/);
	const indent = lines
		.filter((line) => line.trim().length)
		.reduce((min, line) => Math.min(min, line.match(/^[ \t]*/)[0].length), Infinity);

	return isFinite(indent) ? lines.map((line) => line.substring(indent)).join("\n") : markdown;
};

class MarkdownRendererElement extends Component {
	static get NODENAME() {
		return NODENAME;
	}

	static get observedAttributes() {
		return ATTRIBUTES;
	}

	#source = null;

	constructor() {
		super();
	}

	get options() {
		const maxLevel = parseInt(this.attr(ATTR_TOC_MAX_LEVEL), 10);

		return {
			toc: this.hasAttribute(ATTR_TOC),
			tocTitle: this.attr(ATTR_TOC_TITLE),
			tocMaxLevel: isNaN(maxLevel) ? 6 : maxLevel,
		};
	}

	async init() {
		await super.init();

		const attachTo = find(this.attr(ATTR__ATTACH_TO)).first();
		attachTo.on("change", () => {
			this.attr(ATTR_SRC, attachTo.value);
		});

		await this.render();
	}

	attributeChangedCallback(name, oldValue, newValue) {
		super.attributeChangedCallback(name, oldValue, newValue);
		if (oldValue != newValue && this.isConnected && this.ready.resolved) this.render();
	}

	/**
	 * Renders the markdown of `src`, or the markdown from the elements own content, if `src` is missing.
	 */
	async render() {
		const src = this.attr(ATTR_SRC);
		// the inline markdown is only readable before the first render replaces it
		if (!src && this.#source == null) this.#source = dedent(this.textContent);

		try {
			const fragment = src ? await load(src, this.options) : compile(this.#source, this.options);
			this.root.replaceChildren(fragment);
		} catch (e) {
			console.error(`can't render markdown of "${NODENAME}"`, e);
			this.root.replaceChildren();
			this.trigger("markdown-error", e);
		}
	}
}

define(MarkdownRendererElement);

export default MarkdownRendererElement;
