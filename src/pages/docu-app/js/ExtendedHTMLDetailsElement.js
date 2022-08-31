import {componentBaseOf, define} from "@default-js/defaultjs-html-components";

const NODENAME = "app-details";

class ExtendedHMTLDetailsElement extends componentBaseOf(HTMLDetailsElement){

    static get NODENAME() { return NODENAME; }

    constructor(){
        super();
        this.on("click", (event) => { 
            event.stopPropagation(); 
        });
    }
};

define(ExtendedHMTLDetailsElement, {extends: "details"});