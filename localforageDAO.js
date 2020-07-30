import { textboxinput, radioAndCheckboxUpdate } from "./questionnaire.js";

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
      if (element.type == "radio") {
        let selector = `input[value='${results[qid]}']`;
        let selectedRadioElement = formElement.querySelector(selector);
        if (selectedRadioElement) {
          selectedRadioElement.checked = true;
        } else {
          console.log("...  problem with ", element);
        }
        radioAndCheckboxUpdate(selectedRadioElement);
      } else {
        if (element.type == "submit") {
          console.log(
            `local forage is trying to change the value of a submit button. Question ${qid} response value: ${results[qid]}; skipping this 1 value..`
          );
          return;
        }
        element.value = results[qid];
        textboxinput(element);
      }

      // CASE 2: we have an object...
    } else {
      console.log("...  WE HAVE AN OBJECT ... ");
      function getFromRbCb(rbCbName, result) {
        let checkboxElements = Array.from(
          formElement.querySelectorAll(`input[name=${rbCbName}]`)
        );
        checkboxElements.forEach((checkbox) => {
          checkbox.checked = result.includes(checkbox.value);
        });
        radioAndCheckboxUpdate(checkboxElements[0]);
      }

      if (Array.isArray(results[qid])) {
        console.log("...  for KEY ", qid, " WE HAVE AN ARRAY!!!  ... ");
        getFromRbCb(qid, results[qid]);
      } else {
        console.log(
          "...  for KEY ",
          qid,
          " ...1 WE HAVE AN OBJECT!!!  ... ",
          Object.keys(results[qid]),
          Object.values(results[qid])
        );
        Object.keys(results[qid]).forEach((resKey) => {
          if (!resKey) {
            // added because dynamic questions sometimes muck up the previous button.
            console.log(
              `empty key in local forage Question ${qid} response value: ${results[qid]}; skipping this 1 value..`
            );
            return;
          }
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
            let element = Array.from(
              formElement.querySelectorAll(`[xor="${resKey}"]`)
            );
            element.forEach((xorElement) => {
              if (resObject[xorElement.id])
                xorElement.value = resObject[xorElement.id];
            });
            handled = true;
          }
          if (!handled && typeof resObject == "string") {
            let element = document.getElementById(resKey);
            console.log(element);
            if (element.tagName == "DIV" || element.tagName == "FORM") {
              // radio in grid???
              let selector = `input[value='${results[qid][resKey]}']`;
              let selectedRadioElement = element.querySelector(selector);
              if (selectedRadioElement) {
                selectedRadioElement.checked = true;
              } else {
                console.log("...  problem with ", element);
              }
              radioAndCheckboxUpdate(selectedRadioElement);
            } else {
              console.log("=========> text in object...");
              element.value = resObject;
              textboxinput(element);
            }
          }
        });
      }
    }
  });
}

export async function removeQuestion(questName, qid) {
  let results = await localforage.getItem(questName);

  delete results[qid];

  localforage.setItem(questName, results);
}
