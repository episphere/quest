import { textboxinput, numberInputUpdate, radioAndCheckboxUpdate } from "./questionnaire.js";

export async function retrieveFromLocalForage(questName) {
  // get the results from localforage...
  let results = await localforage.getItem(questName);

  if (results == null) results = {};

  // retrieved the results... now lets fill the form..
  Object.keys(results).forEach((qid) => {
    function handleCB() {}

    let formElement = document.querySelector("#" + qid);
    // not sure have a non-question would be here
    // but ignore it...
    if (!formElement) {
      return;
    }
    // each question has an object of results...
    if (!results[qid]) return;

    // CASE 1:  it is just a simple value...
    if (typeof results[qid] == "string") {
      // in this case get the first input/textarea in the form and fill it in.
      let element = formElement.querySelector("input,textarea");
      switch (element.type) {
        case "number":
          element.value = results[qid];
          numberInputUpdate(element);
          break;
        case "date":
        case "textarea":
        case "text":
          element.value = results[qid];
          textboxinput(element);
          break;
        case "radio":
          let selector = `input[value='${results[qid]}']`;
          let selectedRadioElement = formElement.querySelector(selector);
          if (selectedRadioElement) {
            selectedRadioElement.checked = true;
          } else {
            console.log("...  problem with ", element);
          }
          radioAndCheckboxUpdate(selectedRadioElement);
          break;
        default:
          console.log("unhandled type: ", element);
      }
    }
    // CASE 2: we have an object...
    else {
      console.log("...  WE HAVE AN OBJECT ... ");
      if (Array.isArray(results[qid])) {
        let checkboxElements = Array.from(formElement.querySelectorAll(`input[name=${qid}]`));
        checkboxElements.forEach((checkbox) => {
          checkbox.checked = results[qid].includes(checkbox.value);
        });
        radioAndCheckboxUpdate(checkboxElements[0]);
      } else {
        Object.entries(results[qid]).forEach((qEntry) => {
          // qEntry[0] = name of the element (xor)..
          // qEntry[1] = values
          Object.entries(qEntry[1]).forEach((el) => {
            try {
              let element = formElement.querySelector(`[id=${el[0]}]`);
              if (element) {
                element.value = el[1];
                if (el[1].length > 0) textboxinput(element);
              }
            } catch (err) {
              console.error(`====== in question ${qid} result:`, results[qid], el);
              console.error(err);
            }
          });
        });
      }
    }
  });
}
