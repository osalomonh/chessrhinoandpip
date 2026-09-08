// Renders the About screen: parent-facing plain prose, in the order
// contracts/shell.md specifies. DOM-only; the text itself lives in
// shell/strings.ts (aboutStrings).
//
// PLACEHOLDER — chess.js attribution.
// chess.js is not yet a dependency of this project: it arrives at chapter 3
// (see contracts/rules.md). contracts/shell.md requires About to tell the
// truth, so no attribution is written for software not in use. When rules/
// takes on chess.js, add its attribution paragraph where marked below, and
// add the string to shell/strings.ts's aboutStrings.
//
// DOM structure:
//
// <div class="about-screen">
//   <h1 class="about-heading">About Rhino and Pip</h1>
//   <p class="about-paragraph"> ... what this is ... </p>
//   <p class="about-paragraph"> ... who it's for ... </p>
//   <p class="about-paragraph"> ... privacy ... </p>
//   <p class="about-paragraph">The code is open: <a class="about-code-link" href="...">...</a></p>
//   <a class="about-back-link" href="#/">Back to the path</a>
// </div>

import { aboutStrings } from "./strings.js";

export function renderAbout(mount: HTMLElement): void {
  mount.textContent = "";
  mount.className = "about-screen";

  const heading = document.createElement("h1");
  heading.className = "about-heading";
  heading.textContent = aboutStrings.heading;
  mount.appendChild(heading);

  for (const text of [aboutStrings.whatThisIs, aboutStrings.whoItsFor, aboutStrings.privacy]) {
    const p = document.createElement("p");
    p.className = "about-paragraph";
    p.textContent = text;
    mount.appendChild(p);
  }

  const codeParagraph = document.createElement("p");
  codeParagraph.className = "about-paragraph";
  codeParagraph.append(`${aboutStrings.openCodeIntro} `);
  const codeLink = document.createElement("a");
  codeLink.className = "about-code-link";
  codeLink.href = aboutStrings.openCodeLinkHref;
  codeLink.textContent = aboutStrings.openCodeLinkText;
  codeParagraph.appendChild(codeLink);
  mount.appendChild(codeParagraph);

  // PLACEHOLDER — chess.js attribution paragraph goes here once it is a
  // real dependency. See the module comment above.

  const back = document.createElement("a");
  back.className = "about-back-link";
  back.href = "#/";
  back.textContent = aboutStrings.backLinkText;
  mount.appendChild(back);
}
