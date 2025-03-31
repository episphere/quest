import { transform } from "./main.js";
import { moduleParams } from "./questionnaire.js";
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
    try {
      // Check if it's a GitHub URL. Convert to GitHub Raw if needed.
      let urlToFetch = url;

      if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
        urlToFetch = this.convertToGitHubRawUrl(url);
      }

      const response = await fetch(urlToFetch);

      if (!response.ok) {
        console.error(`Failed to fetch from ${urlToFetch}: ${response.status} ${response.statusText}`);

        // Reset URL in history
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        return `Problem retrieving questionnaire module ${url}:
            HTTP response code: ${response.status}
            
            This may be due to CORS restrictions.
            
            Try the following:
              • Using a raw GitHub URL (raw.githubusercontent.com)
              • Hosting the file on a CORS-enabled server
              • Using a local file instead`;
      }

      return await response.text();
    } catch (error) {
      console.error(`Error fetching module from ${url}:`, error);

      // Reset URL in history
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      // Check if it looks like a CORS error
      const errorMessage = error.toString().toLowerCase();
      const likelyCORSError =
        errorMessage.includes('cors') ||
        errorMessage.includes('network') ||
        errorMessage.includes('failed to fetch');

      let helpText = '';
      if (likelyCORSError) {
        helpText = `This appears to be a CORS restriction. If using GitHub, make sure to use the raw URL format.`;
      }

      return `Error retrieving questionnaire module ${url}: ${error.message}.\n${helpText}`;
    }
  }

  // Handle both blob and raw paths in in the format: https://github.com/username/repo/blob/branch/path/to/file.txt
  convertToGitHubRawUrl(url) {
    if (url.includes('github.com')) {
      let rawUrl = url;
      rawUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com');
      rawUrl = rawUrl.replace('/blob/', '/').replace('/raw/', '/');

      console.log("Converted GitHub URL:", rawUrl);
      return rawUrl;
    }

    return url;
  }

  async startUp() {
    await this.initializeLocalForage();
    await this.loadPreviousResultsFromStorage();
    this.setInitialUIState();
    await this.processURLParams();
    this.setUpEventListeners();
    await this.setUpRenderingListeners();
  }

  async initializeLocalForage() {
    try {
      this.questLocalForage = await localforage.createInstance({
        name: "questParams",
        storeName: "params",
      });

      // Retrieve logic and styling from local storage or set default values
      try {
        this.logicFromStorage = await this.questLocalForage.getItem("logic");
        this.logicFromStorage = this.logicFromStorage ?? false;
      } catch (error) {
        console.warn("Failed to retrieve logic setting:", error);
        this.logicFromStorage = false;
      }

      try {
        this.stylingFromStorage = await this.questLocalForage.getItem("styling");
        this.stylingFromStorage = this.stylingFromStorage ?? false;
      } catch (error) {
        console.warn("Failed to retrieve styling setting:", error);
        this.stylingFromStorage = false;
      }

    } catch(error) {
      console.error("Failed to initialize LocalForage:", error);
      // Fallback if LocalForage fails
      this.questLocalForage = {
        getItem: (key) => {
          console.warn("Using memory for getItem (LF fallback):", key);
          return Promise.resolve(null);
        },
        setItem: (key, value) => {
          console.warn("Using memory for setItem (LF fallback):", key);
          return Promise.resolve(value);
        },
        clear: () => {
          console.warn("Using memory for clear (LF fallback)");
          return Promise.resolve();
        }
      };
      this.logicFromStorage = false;
      this.stylingFromStorage = false;
    }
  }

  setInitialUIState() {
    if (location.hash.split("&").includes("run") || this.searchParams.has("run")) {
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

  async processURLParams() {
    // Set parameters from URL and hash
    const searchParams = new URLSearchParams(location.search);
    const hashStr = location.hash.substring(1);

    // Create URLSearchParams object from the hash
    const hashParams = new URLSearchParams(hashStr.includes('?') || hashStr.includes('&') ? hashStr : '');

    // Process run parameter (from either source)
    const runMode = searchParams.has('run') || hashParams.has('run');
    if (runMode) {
      document.getElementById('logic').checked = true;
      document.getElementById('styling').checked = this.stylingFromStorage;
      document.getElementById('questNavbar').style.display = 'none';
      document.getElementById('markup').style.display = 'none';
      document.getElementById('renderText').style.display = 'none';

      const parentElement = document.getElementById("rendering").parentElement;
      parentElement.classList.remove("col-12", "col-md-6");
    }

    // Handle style parameter
    let styleSheet = null;
    if (searchParams.has('style')) {
      styleSheet = searchParams.get('style');
      document.getElementById("logic").dataset.sheetOn = styleSheet;
    } else if (hashParams.has('style')) {
      styleSheet = hashParams.get('style');
      document.getElementById("logic").dataset.sheetOn = styleSheet;
    }

    if (styleSheet) {
      document.getElementById("pagestyle").setAttribute("href", styleSheet);
    } else if (runMode && !styleSheet) {
      document.getElementById("pagestyle").setAttribute("href", "Style1.css");
    }

    // Handle URL to load (from either source)
    let urlToLoad = null;
    if (searchParams.has('url')) {
      urlToLoad = searchParams.get('url');
    } else {
      // Extract URL from hash if it exists
      const hashContent = decodeURIComponent(location.hash.substring(1));
      if (hashContent && !hashContent.includes('=') && !hashContent.includes('&')) {
        urlToLoad = hashContent;
      }
    }

    if (urlToLoad) {
      await this.loadModule(urlToLoad);
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + '#' + urlToLoad
      );
    }

    // Handle previous results from URL parameters
    searchParams.forEach((value, key) => {
      if (!["run", "style", "url", "config"].includes(key)) {
        this.previousResults[key] = value;
      }
    });

    // Set the styling and logic based on current checkboxes
    this.setStylingAndLogic();
  }

  async loadModule(url) {
    this.markupTextAreaEle.value = await this.fetchModule(url);
    await this.renderMarkup();
  }

  // Fill the Settings -> Previous Results textarea with the previousResults object
  async loadPreviousResultsFromStorage() {
    try {
      const cachedPreviousResults = await this.questLocalForage.getItem("previousResults") ?? "";
      this.previousResults = cachedPreviousResults.length > 0 ? JSON.parse(cachedPreviousResults) : {};

      // Also update the textarea display
      this.jsonInput.value = cachedPreviousResults.length > 0 ? cachedPreviousResults : "";
    } catch (error) {
      console.error("Error loading previous results:", error);
      this.previousResults = {};
      this.jsonInput.value = "";
    }
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
    document.getElementById("increaseSizeButton").addEventListener("click", () => this.increaseMarkupTextSize());
    document.getElementById("decreaseSizeButton").addEventListener("click", () => this.decreaseMarkupTextSize());

    // Clear local forage
    document.getElementById("clearMem").addEventListener("click", () => this.clearLocalForage());

    // Hide markup checkbox
    document.querySelector("#hide-markup").addEventListener("change", (event) => {
      document.getElementById("markup").style.display = event.target.checked ? "none" : "initial";
      document.getElementById("renderText").style.display = event.target.checked ? "none" : "initial";
    });

    // Save document, load from URL, and Demo buttons
    document.getElementById("saveBtn").addEventListener("click", () => this.saveDoc());
    document.getElementById("loadURLBtn").addEventListener("click", () => this.submitURL());
    document.getElementById("demo").addEventListener("click", (event) => this.handleDemoClick(event));
    
    // View current responses tab
    document.getElementById("viewCurrentResponses").addEventListener("click", () => this.buildCurrentResponseTable());

    // JSON input handling for the renderer "Settings" tab
    document.getElementById("updater").addEventListener("click", async () => {
      await this.updatePreviousResultsJSON();
    });

    // Changes to the logic and styling checkboxes
    document.querySelectorAll("#logic,#styling").forEach((ele) => {
      ele.addEventListener("change", async (event) => {
        // Save the current markdown content and new checkbox state
        const currentMarkdown = this.markupTextAreaEle.value;
        await this.questLocalForage.setItem(event.target.id, event.target.checked);

        // Update stylesheet references
        this.setStylingAndLogic();

        // If there's content to reload, re-render it
        if (currentMarkdown && currentMarkdown.trim() !== "") {
          await this.renderMarkup();
        }
      });
    });
  }

  async setUpRenderingListeners() {
    this.markupTextAreaEle.addEventListener("keyup", () => {
      this.debounce(async () => await this.renderMarkup());
    });
  }

  debounce(func, tt = 500) {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    this.debounceTimeout = setTimeout(async () => {
      try {
        await func(this.previousResults);
      } catch (error) {
        console.error("Error in debounced function:", error);
      }
    }, tt);
  }

  async renderMarkup() {
    try {
      // Clear the rendering container first
      const renderingContainer = document.getElementById("rendering");
      if (renderingContainer) {
        renderingContainer.innerHTML = '';
      }

      const renderObj = {
        text: this.markupTextAreaEle.value,                   // Survey text
        lang: document.getElementById("langSelect").value,    // Survey language
        activate: document.getElementById("logic").checked,   // Activate logic: Full question list = not checked, one question at a time = checked
        isRenderer: true,                                     // Renderer flag: Built-in renderer = true vs embedded usage = false (e.g. the MyConnect implementation)
      };

      await transform.render(renderObj, "rendering", this.previousResults);
    } catch (error) {
      console.error("Error during rendering:", error);
      document.getElementById("rendering").innerHTML =
        `<div class="alert alert-danger">Error rendering: ${error.message}</div>`;
    }
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
      return;
    }

    Object.entries(responses)
      .filter(([key, value]) => key !== 'treeJSON' && value != null)
      .forEach(([key, value]) => {
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

  async clearLocalForage() {
    try {
      await localforage.clear();
      await this.questLocalForage.removeItem("previousResults");
      
      // Clear the PreviousResults data
      this.previousResults = {};
      this.jsonInput.value = "";

      // Update the display message
      this.loadDisplay.innerHTML = "Previous results cleared successfully";

    } catch (err) {
      console.error("Error clearing LocalForage:", err);
      this.loadDisplay.innerHTML = "Error clearing LocalForage: " + err;
      moduleParams.errorLogger("Error while clearing local forage:", err);
    }
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

  async updatePreviousResultsJSON() {
    let txt = "";
    try {
      if (this.jsonInput.value.length > 0) {
        JSON.parse(this.jsonInput.value);

        this.previousResults = JSON.parse(this.jsonInput.value);
        await this.questLocalForage.setItem("previousResults", this.jsonInput.value);
        txt = "Added JSON successfully.";

      } else {
        this.previousResults = {};
        await this.questLocalForage.setItem("previousResults", "");
        txt = "Cleared previous results.";
      }

    } catch (err) {
      txt = "Error: Invalid JSON format.";
      console.error("Error updating previous results:", err);
    }
    this.loadDisplay.innerText = txt;
  }

  saveDoc() {
    // Get the markup text area element properly
    const markupTextArea = document.getElementById("markupTextArea");
    const tb = document.getElementById("tb");
    // Use a default file name if the user hasn't provided one
    const fileName = tb.value && tb.value.trim() ? tb.value.trim() : "demo";
    const blob = new Blob([markupTextArea.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    return a;
  }

  submitURL() {
    let url = document.getElementById("url").value
    let newUrl = new URL(window.location.href);
    newUrl.searchParams.set('url', url);
    window.location.href = newUrl.toString();
  }

  handleDemoClick(event) {
    event.preventDefault();
    const demoUrl = document.getElementById("demo").href;
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("url", demoUrl);
    window.location.href = newUrl.toString();
  }
}

// Initialize the renderer
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => {
    const questRenderer = new QuestRenderer();
    await questRenderer.startUp();
  });

} else {
  (async () => {
    const questRenderer = new QuestRenderer();
    await questRenderer.startUp();
  })();
}
