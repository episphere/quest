import { textboxinput, radioAndCheckboxUpdate } from "./questionnaire.js";

export async function restoreResults(results) {
  // get the results from localforage...


  // retrieved the results... now lets fill the form..
  Object.keys(results).forEach((qid) => {
    function handleString(questionElement, id, value) {
      // check if we have a radiobutton/checkbox...
      let element = questionElement.querySelector(`[name='${id}'][value='${value.replaceAll("'", "\\'")}']`)
      if (element) {
        element.checked = true
        radioAndCheckboxUpdate(element)
        return;
      }
      // check for some kind of input element...
      element = questionElement.querySelector(`[id='${id}']`);
      if (element) {
        element.value = value
        textboxinput(element, false);
        return;
      }

      console.log("==========  dont know how to handle this  ==========", questionElement, id, value)
    }
    console.log('-------checking qids------------')
    console.log(qid)
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
      // null handle element, skip if null (load failing when participant is in the middle of unanswered SOCcer questions)
      if (element?.type == "radio") {
        let selector = `input[value='${results[qid]}']`;
        let selectedRadioElement = formElement.querySelector(selector);
        if (selectedRadioElement) {
          selectedRadioElement.checked = true;
        } else {
          console.log("...  problem with ", element);
        }
        radioAndCheckboxUpdate(selectedRadioElement);
      } else {
        if (element?.type == "submit") {
          console.log(
            `local forage is trying to change the value of a submit button. Question ${qid} response value: ${results[qid]}; skipping this 1 value..`
          );
          return;
        }

        if (element?.value) {
          element.value = results[qid];
          textboxinput(element, false);
        }
      }

      // we should return from here...
      // then we should handle the ARRAY case.
      // which is likely a combobox...
      //   create a handleArray function...
      // then we should handle the Object case
      //   again create a handleObject function
      //   that can be called recursively to handle
      //   any potential depth of the results JSON.
      //   also, handleObject should call handleString,
      //   handleArray and handleObject.
      //   Unfortunately, we need handleArray/handleString to
      //   handle a potential null id for the case where
      //   the results is simply a string or an array.
      // CASE 2: we have an object...
    } else {
      function getFromRbCb(rbCbName, result) {
        let checkboxElements = Array.from(
          formElement.querySelectorAll(`input[name=${rbCbName}]`)
        );
        checkboxElements.forEach((checkbox) => {
          if (result.includes(checkbox.value)) {
            checkbox.checked = true;
            radioAndCheckboxUpdate(checkbox);
          }
        });
      }

      if (Array.isArray(results[qid])) {
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
          let handled = false;
          if (typeof resObject == 'string') {
            handleString(formElement, resKey, resObject)
            handled = true;
          }
          if (Array.isArray(resObject)) {
            getFromRbCb(resKey, resObject);
            handled = true;
          }
          if (!handled && typeof resObject == "object") {
            // ok wasn't an array .. i.e. it wasnt a radiobutton...
            // how about an XOR object...
            let element = Array.from(
              formElement.querySelectorAll(`[xor="${resKey}"]`)
            );
            element.forEach((xorElement) => {
              if (resObject[xorElement.id])
                xorElement.value = resObject[xorElement.id];
            });
            handled = true;
          }
          // check for mulitple radio buttons on 1 page...
          let multiq = formElement.querySelector(`input[name='${resKey}'][value='${CSS.escape(resObject)}']`)
          if (multiq) {
            multiq.checked = true
            handled = true;
          }
          if (!handled && typeof resObject == "string") {
            let element = document.getElementById(resKey);
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
              element.value = resObject;
              textboxinput(element, false);
            }
          }
        });
      }
    }
  });
}

export async function removeQuestion(questName, qid) {
  //check here for going back issue?

  let results = await localforage.getItem(questName);

  if (results && results[qid]) {
    delete results[qid];
  }

  localforage.setItem(questName, results);
}
