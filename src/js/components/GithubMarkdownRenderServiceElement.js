import {Component, define} from "@default-js/defaultjs-html-components";


const NODENAME = "x-github-markdown-render-service";
const ATTR_SRC = "src";

class GithubMarkdownRenderService extends Component {

    static get NODENAME() { return NODENAME; }

    #rendered = false;

    constructor(){
        super();
    }

    async init(){
        await super.init();
        if(!this.#rendered){
            const src = this.attr(ATTR_SRC);
            let markdown = await fetch(src);
            markdown = await markdown.text();
            markdown = await fetch("https://api.github.com/markdown", {
                method: "post",
                headers: {
                    "Accept": "application/vnd.github+json"
                },
                body : JSON.stringify({ text: markdown })
            });
            markdown = await markdown.text();
            const content = create(markdown);
            const anchors = content.find(`a[id^="user-content" i]`) || [];
            for(const anchor of anchors){
                const href = anchor.attr("href").replace("#", "");
                if(href)
                anchor.attr("id", href);
            }
            
            this.root.append(content);

            this.#rendered = true;
        }
    }
};

define(GithubMarkdownRenderService);

