(function () {
  function createBaseClass(scheduleRender) {
    return class DCLogic {
      setState(update) {
        const patch = typeof update === "function" ? update(this.state) : update;
        if (!patch || typeof patch !== "object") return;
        this.state = { ...this.state, ...patch };
        scheduleRender();
      }
    };
  }

  function makeEvaluator(scope) {
    return function evaluate(expression) {
      try {
        return Function("scope", "with (scope) { return (" + expression + "); }")(scope);
      } catch (error) {
        console.warn("Could not evaluate expression:", expression, error);
        return "";
      }
    };
  }

  function expressionFromMustache(value) {
    const match = String(value || "").trim().match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
    return match ? match[1] : null;
  }

  function interpolate(value, scope) {
    const evaluator = makeEvaluator(scope);
    return String(value).replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, function (_, expression) {
      const result = evaluator(expression);
      return result == null ? "" : String(result);
    });
  }

  function processNode(node, scope, refs) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue.includes("{{")) node.nodeValue = interpolate(node.nodeValue, scope);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName.toLowerCase();

    if (tagName === "sc-if") {
      const expression = expressionFromMustache(node.getAttribute("value"));
      const visible = expression ? !!makeEvaluator(scope)(expression) : false;
      const replacement = document.createDocumentFragment();

      if (visible) {
        Array.from(node.childNodes).forEach(function (child) {
          const clone = child.cloneNode(true);
          replacement.appendChild(clone);
          processNode(clone, scope, refs);
        });
      }

      node.replaceWith(replacement);
      return;
    }

    if (tagName === "sc-for") {
      const listExpression = expressionFromMustache(node.getAttribute("list"));
      const itemName = node.getAttribute("as") || "item";
      const list = listExpression ? makeEvaluator(scope)(listExpression) : [];
      const replacement = document.createDocumentFragment();

      (Array.isArray(list) ? list : []).forEach(function (item, index) {
        const childScope = { ...scope, [itemName]: item, $index: index };
        Array.from(node.childNodes).forEach(function (child) {
          const clone = child.cloneNode(true);
          replacement.appendChild(clone);
          processNode(clone, childScope, refs);
        });
      });

      node.replaceWith(replacement);
      return;
    }

    Array.from(node.attributes).forEach(function (attribute) {
      const name = attribute.name;
      const rawValue = attribute.value;
      const expression = expressionFromMustache(rawValue);

      if (name === "onclick" || name === "onchange") {
        const handler = expression ? makeEvaluator(scope)(expression) : null;
        node.removeAttribute(name);
        if (typeof handler === "function") {
          node.addEventListener(name.slice(2), function (event) {
            handler(event);
          });
        }
        return;
      }

      if (name === "ref") {
        const refHandler = expression ? makeEvaluator(scope)(expression) : null;
        node.removeAttribute(name);
        if (typeof refHandler === "function") refs.push([refHandler, node]);
        return;
      }

      if (rawValue.includes("{{")) {
        const nextValue = expression ? makeEvaluator(scope)(expression) : interpolate(rawValue, scope);
        const normalizedValue = nextValue == null ? "" : String(nextValue);
        node.setAttribute(name, normalizedValue);
        if (name === "value") node.value = normalizedValue;
      }
    });

    Array.from(node.childNodes).forEach(function (child) {
      processNode(child, scope, refs);
    });
  }

  function boot() {
    const root = document.querySelector("x-dc");
    if (!root) return;

    const script = document.querySelector("script[type='text/x-dc'][data-dc-script]");
    if (!script) return;

    const helmet = root.querySelector("helmet");
    if (helmet) {
      Array.from(helmet.childNodes).forEach(function (child) {
        document.head.appendChild(child.cloneNode(true));
      });
    }

    const templateRoot = root.cloneNode(true);
    templateRoot.querySelectorAll("script[type='text/x-dc'][data-dc-script], helmet").forEach(function (node) {
      node.remove();
    });
    const templateHtml = templateRoot.innerHTML.trim();

    let component;
    let renderRequested = false;

    function render() {
      renderRequested = false;
      const values = component.renderVals();
      const template = document.createElement("template");
      const refs = [];
      template.innerHTML = templateHtml;
      Array.from(template.content.childNodes).forEach(function (node) {
        processNode(node, values, refs);
      });
      root.replaceChildren(template.content);
      refs.forEach(function ([handler, element]) {
        handler(element);
      });
    }

    function scheduleRender() {
      if (renderRequested) return;
      renderRequested = true;
      render();
    }

    const DCLogic = createBaseClass(scheduleRender);
    const Component = Function("DCLogic", script.textContent + "\nreturn Component;")(DCLogic);
    component = new Component();

    render();
  }

  const style = document.createElement("style");
  style.textContent = `
    html, body {
      min-height: 100%;
      margin: 0;
      background: #ddd9cf;
    }

    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    x-dc {
      display: block;
      width: min(402px, 100vw);
      height: min(874px, 100vh);
    }

    x-import[component="IOSDevice"] {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #faf9f6;
      border-radius: 36px;
      box-shadow: 0 24px 70px rgba(27, 29, 26, .22), 0 0 0 1px rgba(27, 29, 26, .08);
    }

    button, textarea {
      -webkit-tap-highlight-color: transparent;
    }

    @media (max-width: 520px) {
      body {
        align-items: stretch;
        background: #faf9f6;
      }

      x-dc {
        width: 100vw;
        height: 100vh;
      }

      x-import[component="IOSDevice"] {
        border-radius: 0;
        box-shadow: none;
      }
    }
  `;
  document.head.appendChild(style);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
