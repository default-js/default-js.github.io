
import "../css/highlight.css";

import hljs  from "highlight.js";
import javascript from "highlight.js/lib/languages/javascript";
import xml from "highlight.js/lib/languages/xml";
import shell from "highlight.js/lib/languages/shell";

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('shell', shell);

export default hljs;
