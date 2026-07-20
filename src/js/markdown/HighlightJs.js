import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import shell from "highlight.js/lib/languages/shell";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

hljs.registerAliases(["html", "htm", "xhtml"], { languageName: "xml" });
hljs.registerAliases(["js", "mjs"], { languageName: "javascript" });
hljs.registerAliases(["ts"], { languageName: "typescript" });
hljs.registerAliases(["sh", "console"], { languageName: "shell" });
hljs.registerAliases(["md"], { languageName: "markdown" });
hljs.registerAliases(["yml"], { languageName: "yaml" });
hljs.registerAliases(["text", "txt"], { languageName: "plaintext" });

export default hljs;
