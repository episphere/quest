import { transform } from "./replace2.js";
import { moduleParams, questionQueue } from "./questionnaire.js";
import { getStateManager } from "./stateManager.js";

class QuestRenderer {
  constructor() {
    this.previousResults = {};
    this.debounceTimeout = null;
    this.questLocalForage = null;
    this.logicFromStorage = false;
    this.stylingFromStorage = false;
    this.searchParams = new URLSearchParams(location.search);
    this.markupTextAreaEle = document.getElementById("markupTextArea");
    this.loadDisplay = document.getElementById("loadDisplay");
    this.jsonInput = document.getElementById("jsonInput");
    this.userEditing = false;
  }

  async fetchModule(url) {
    const response = await fetch(url);
    if (!response.ok) {
      return `<h3>Problem retrieving questionnaire module <i>${url}</i>:</h3> HTTP response code: ${response.status}`;
    }
    return await response.text();
  }

  async startUp() {
    await this.initializeLocalForage();
    this.setInitialUIState();
    this.handleURLParams();
    this.setUpEventListeners();
    this.setUpDebouncedRendering();
  }

  async initializeLocalForage() {
    this.questLocalForage = await localforage.createInstance({
      name: "questParams",
      storeName: "params",
    });

    // Retrieve logic and styling from local storage or set default values
    this.logicFromStorage = (await this.questLocalForage.getItem("logic")) ?? false;
    this.stylingFromStorage = (await this.questLocalForage.getItem("styling")) ?? false;
  }

  setInitialUIState() {
    if (
      location.hash.split("&").includes("run") ||
      this.searchParams.has("run")
    ) {
      document.getElementById("logic").checked = true;
      document.getElementById("styling").checked = this.stylingFromStorage;
      document.getElementById("questNavbar").style.display = "none";
      document.getElementById("markup").style.display = "none";
      document.getElementById("renderText").style.display = "none";
    } else {
      document.getElementById("logic").checked = this.logicFromStorage;
      document.getElementById("styling").checked = this.stylingFromStorage;
    }

    this.setStylingAndLogic();
  }

  handleURLParams() {
    // Handle previous results from URL parameters
    this.searchParams.forEach((value, key) => {
      if (!["run", "style", "url"].includes(key)) {
        this.previousResults[key] = value;
      }
    });


    // Load previous results from local storage if not provided in URL
    if (Object.keys(this.previousResults).length === 0) {
      this.loadPreviousResultsFromStorage();
    }

    this.jsonInput.innerText = JSON.stringify(this.previousResults, null, 3);

    // Handle URL parameters and fragment identifiers
    const fragmentUrl = decodeURIComponent(location.hash.substring(1));
    if (fragmentUrl.length > 0) {
      this.loadModule(fragmentUrl);

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + '#' + fragmentUrl
      );

    } else if (this.searchParams.has("url")) {
      const url = this.searchParams.get("url");
      this.loadModule(url);

      // Update the URL to remove ?url=... and add #url
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + "#" + url
      );
    }

    if (this.searchParams.has("config")) {
      this.loadModule(confirm.markdown);
    }

    if (this.searchParams.has("style")) {
      document.getElementById("logic").dataset.sheetOn = this.searchParams.get("style");
    }

    if (this.searchParams.has("run")) {
      const parentElement = document.getElementById("rendering").parentElement;
      parentElement.classList.remove("col-12", "col-md-6");
      if (!this.searchParams.has("style")) {
        document.getElementById("pagestyle").setAttribute("href", "Style1.css");
      }
    }
  }

  async loadModule(url) {
    this.markupTextAreaEle.value = await this.fetchModule(url);
    this.renderMarkup();
  }

  async loadPreviousResultsFromStorage() {
    const cachedPreviousResults =
      (await this.questLocalForage.getItem("previousResults")) ?? "";
    this.previousResults =
      cachedPreviousResults.length > 0 ? JSON.parse(cachedPreviousResults) : {};
  }

  setUpEventListeners() {
    // Detect manual text entry by the user for URL management
    this.markupTextAreaEle.addEventListener("input", () => {
      this.userEditing = true;
    });

    // Check if the user has manually added text after loading. If yes, reset the URL.
    this.markupTextAreaEle.addEventListener("blur", () => {
      if (this.userEditing) {
        window.history.replaceState(
          {},
          document.title,
          "index.html");
      }
    });

    // Increase and decrease font size
    document.getElementById("increaseSizeButton").addEventListener("click", this.increaseMarkupTextSize);
    document.getElementById("decreaseSizeButton").addEventListener("click", this.decreaseMarkupTextSize);

    // Clear local forage
    document.getElementById("clearMem").addEventListener("click", this.clearLocalForage.bind(this));

    // Styling and logic checkboxes
    document.querySelectorAll("#logic,#styling").forEach((ele) => {
      ele.addEventListener("change", (event) => {
        this.questLocalForage.setItem(event.target.id, event.target.checked);
        this.setStylingAndLogic();
      });
    });

    // Hide markup checkbox
    document.querySelector("#hide-markup").addEventListener("change", (event) => {
      document.getElementById("markup").style.display = event.target.checked ? "none" : "initial";
      document.getElementById("renderText").style.display = event.target.checked ? "none" : "initial";
    });

    // View current responses
    document.getElementById("viewCurrentResponses").addEventListener("click", this.buildCurrentResponseTable.bind(this));

    // JSON input handling for the renderer "Settings" tab
    document.getElementById("updater").addEventListener("click", () => {
      this.updatePreviousResults();
    });
  }

  setUpDebouncedRendering() {
    this.markupTextAreaEle.addEventListener("keyup", () => {
      this.renderMarkup();
    });
  }

  renderMarkup() {
    this.debounce((previousResults) => {
      const renderObj = {
        text: this.markupTextAreaEle.value,
        lang: document.getElementById("langSelect").value,
        activate: document.getElementById("logic").checked,
        isRenderer: true,
      };

      transform.render(renderObj, "rendering", previousResults);
    });
  }

  increaseMarkupTextSize() {
    const markupTextAreaEle = document.getElementById("markupTextArea");
    const style = window
      .getComputedStyle(markupTextAreaEle, null)
      .getPropertyValue("font-size");
    const fontSize = parseFloat(style);
    markupTextAreaEle.style.fontSize = fontSize + 1 + "px";
  }

  decreaseMarkupTextSize() {
    const markupTextAreaEle = document.getElementById("markupTextArea");
    const style = window
      .getComputedStyle(markupTextAreaEle, null)
      .getPropertyValue("font-size");
    const fontSize = parseFloat(style);
    markupTextAreaEle.style.fontSize = fontSize - 1 + "px";
  }

  buildCurrentResponseTable() {
    const tableElement = document.getElementById("currentResponsesTable");
    tableElement.innerHTML = "";

    const tableHeadElement = tableElement.createTHead();
    const headerRow = tableHeadElement.insertRow();

    let cell = document.createElement("th");
    cell.innerText = "Id";
    headerRow.appendChild(cell);

    cell = document.createElement("th");
    cell.innerText = "Value";
    headerRow.appendChild(cell);

    const tableBodyElement = tableElement.createTBody();

    const appState = getStateManager(true);
    if (!appState) {
      this.insertEmptyTableRow(tableBodyElement, "No responses found. Please load a survey first.");
      return;
    }

    const responses = appState.getSurveyState();

    if (Object.keys(responses).length === 0) {
      this.insertEmptyTableRow(tableBodyElement, "No responses found. Please load a survey first.");
    }

    Object.entries(responses).forEach(([key, value]) => {
      const row = tableBodyElement.insertRow();
      let cell = row.insertCell();
      cell.innerText = key;
      cell = row.insertCell();
      cell.innerHTML = `<pre>${JSON.stringify(value, null, 3)}</pre>`;
    });
  }

  insertEmptyTableRow(tableBodyElement, message) {
    const row = tableBodyElement.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 2; // Span across both columns
    cell.innerText = message;
  }

  clearLocalForage() {
    localforage
      .clear()
      .then(() => {
        this.loadDisplay.innerHTML = "local forage cleared";
      })
      .catch((err) => {
        this.loadDisplay.innerHTML = "caught error" + err;
        moduleParams.errorLogger("Error while clearing local forage:", err);
      });

    questionQueue.clear();

    this.previousResults = {};
  }

  setStylingAndLogic() {
    const setValueFromCheckboxSelection = (cssId, checkboxId) => {
      const checkboxElement = document.getElementById(checkboxId);
      const cssElement = document.getElementById(cssId);
      cssElement.setAttribute(
        "href",
        checkboxElement.checked
          ? checkboxElement.dataset.sheetOn
          : checkboxElement.dataset.sheetOff
      );
    };

    setValueFromCheckboxSelection("pagestyle", "styling"); // Stylesheet
    setValueFromCheckboxSelection("pagelogic", "logic"); // Logicsheet
  }

  debounce(func, tt = 500) {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    this.debounceTimeout = setTimeout(() => func(this.previousResults), tt);
  }

  updatePreviousResults() {
    let txt = "";
    try {
      this.previousResults =
        this.jsonInput.value.length > 0
          ? JSON.parse(this.jsonInput.value)
          : {};
      this.questLocalForage.setItem("previousResults", this.jsonInput.value);
      txt = "Added JSON successfully.";
    } catch (err) {
      txt = "Caught error: " + err;
    }
    this.loadDisplay.innerText = txt;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    const questRenderer = new QuestRenderer();
    questRenderer.startUp();
  });
} else {
  const questRenderer = new QuestRenderer();
  questRenderer.startUp();
}
