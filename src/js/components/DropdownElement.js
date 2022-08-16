import { Component, define } from "@default-js/defaultjs-html-components";

const BODY = document.body;
const TOUCH_ONLY = window.matchMedia("(any-hover: none)").matches;

let OPEN_DROPDOWN = null;
const closeActiveDropdown = () => {
	if (OPEN_DROPDOWN) {
		OPEN_DROPDOWN.active = false;
		OPEN_DROPDOWN = null;
	}
};
BODY.on("click", closeActiveDropdown);

const NODENAME = "x-dropdown";
const DROPDOWN_CONTENT_SELECTOR = "x-dropdown-content, .dropdown-content";

const ATTRIBUTE_ACTIVE = "active";
export default class DropdownElement extends Component {
	static get NODENAME() {
		return NODENAME;
	}

	#initialied = false;
	#active = false;

	constructor() {
		super();
	}

	async init() {
		await super.init();

		if (!this.#initialied) {
			let mouseleaveTimeout = null;
			const eventType = TOUCH_ONLY ? "click" : "mouseover";
			this.on(eventType, (event) => {
				const target = event.target;
				const onContent = target.is(DROPDOWN_CONTENT_SELECTOR) || target.parent(DROPDOWN_CONTENT_SELECTOR);
				if (!onContent) {
					if (!this.active) {
						event.preventDefault();
						event.stopPropagation();
						this.active = true;
					}
				}
				clearTimeout(mouseleaveTimeout);
			});
			if (!TOUCH_ONLY) {
				this.on("mouseleave", (event) => {
					if (mouseleaveTimeout) clearTimeout(mouseleaveTimeout);
					mouseleaveTimeout = setTimeout(() => {
						if (this.active) {
							event.preventDefault();
							event.stopPropagation();
							this.active = false;
						}
						mouseleaveTimeout = null;
					}, 200);
				});
			}
		}
	}

	get active() {
		return this.#active;
	}

	set active(value) {
		if (value && OPEN_DROPDOWN != this) {
			closeActiveDropdown();
			OPEN_DROPDOWN = this;
		}
		this.#active = value;
		this.attr(ATTRIBUTE_ACTIVE, value ? "" : null);
	}
}

define(DropdownElement);
