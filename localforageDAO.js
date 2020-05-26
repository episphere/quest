import { textboxinput, numberInputUpdate, radioAndCheckboxUpdate } from "./questionnaire.js";

export async function retrieveFromLocalForage(questName) {
  // get the results from localforage...
  let results = await localforage.getItem(questName);

  if (results == null) results = {};

  // retrieved the results... now lets fill the form..
  Object.keys(results).forEach((qid) => {
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
      fillElement(element, results[qid]);
    }
    // CASE 2: we have an object...
    else {
      console.log("...  WE HAVE AN OBJECT ... ");
      if (Array.isArray(results[qid])) {
        fillCheckBox(formElement, results[qid], qid);
      } else {
        Object.entries(results[qid]).forEach((qEntry) => {
          // their can be multiple strings/
          // qEntry[0] = key in the object ..
          // qEntry[1] = value of the object...
          // we could have a checkbox ...
          console.log(qEntry[0], "===>", qEntry[1]);
          if (Array.isArray(qEntry[1])) {
            fillCheckBox(formElement, qEntry[1], qEntry[0]);
          } else {
            // we dont have an array but and object
            Object.entries(qEntry[1]).forEach((child1) => {
              if (typeof child1[1] == "string") {
                // it is possibly a name...
                let element = Array.from(formElement.querySelectorAll(`input[name=${child1[0]}]`));
                console.log(element);
              } else {
                console.log("something else.");
              }
            });
          }

          // Object.entries(qEntry[1]).forEach((el) => {
          //   try {
          //     let element = formElement.querySelector(`[id=${el[0]}]`);
          //     if (element) {
          //       element.value = el[1];
          //       if (el[1].length > 0) textboxinput(element);
          //     }
          //   } catch (err) {
          //     console.error(`====== in question ${qid} result:`, results[qid], el);
          //     console.error(err);
          //   }
          // });
        });
      }
    }
  });
  ret;
}

function fillElement(element, result) {
  switch (element.type) {
    case "number":
      element.value = result;
      numberInputUpdate(element);
      break;
    case "date":
    case "textarea":
    case "text":
      element.value = result;
      textboxinput(element);
      break;
    case "radio":
      let selector = `input[value='${result}']`;
      let selectedRadioElement = element.form.querySelector(selector);
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
function fillCheckBox(formElement, result, name) {
  let checkboxElements = Array.from(formElement.querySelectorAll(`input[type='checkbox'][name=${name}]`));
  if (checkboxElements.length == 0) {
    console.error(" I thought we had a checkbox, but we dont!!!");
  }
  checkboxElements.forEach((checkbox) => {
    checkbox.checked = result.includes(checkbox.value);
  });
  radioAndCheckboxUpdate(checkboxElements[0]);
}
