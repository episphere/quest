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
      let element = formElement.querySelector("input,textarea,select");
      switch (element.type) {
        case "number":
          element.value = results[qid];
          numberInputUpdate(element);
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
          element.value = results[qid];
          textboxinput(element);
      }
    }
    // CASE 2: we have an object...
    else {
      console.log("...  WE HAVE AN OBJECT ... ");
      function getFromRbCb(rbCbName, result) {
        let checkboxElements = Array.from(formElement.querySelectorAll(`input[name=${qid}]`));
        checkboxElements.forEach((checkbox) => {
          checkbox.checked = result.includes(checkbox.value);
        });
        radioAndCheckboxUpdate(checkboxElements[0]);
      }

      if (Array.isArray(results[qid])) {
        console.log("...  for KEY ", qid, " WE HAVE AN ARRAY!!!  ... ");
        getFromRbCb(qid, results[qid]);
      } else {
        console.log("...  for KEY ", qid, " WE HAVE AN OBJECT!!!  ... ", Object.keys(results[qid]), Object.values(results[qid]));
        Object.keys(results[qid]).forEach((resKey) => {
          let resObject = results[qid][resKey];
          console.log(resKey, resObject);

          let handled = false;
          if (Array.isArray(resObject)) {
            getFromRbCb(resKey, resObject);
            handled = true;
          }
          if (!handled && typeof resObject == "object") {
            // ok wasn't an array .. i.e. it wasnt a radiobutton...
            // how about an XOR object...
            console.log("==========> XOR OBJ....");
            let element = Array.from(formElement.querySelectorAll(`[xor="${resKey}"]`));
            element.forEach((xorElement) => {
              if (resObject[xorElement.id]) xorElement.value = resObject[xorElement.id];
            });
            handled = true;
          }
          if (!handled && typeof resObject == "string") {
            console.log("=========> text in object...");
            let element = formElement.querySelector(`[id="${resKey}"]`);
            if (element) {
              element.value = resObject;
              switch (element.type) {
                case "number":
                  numberInputUpdate(element);
                  break;
                default:
                  textboxinput(element);
              }
            }
          }
        });
      }
    }
  });
}
