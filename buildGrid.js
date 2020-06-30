export const grid_replace_regex = /\|grid\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g;

export function firstFun(event) {
  event.preventDefault();
  console.log("WTF!!!");
}
export function toggle_grid(event) {
  event.preventDefault();
  let element = event.target;
  let id_regex = /(^.*?)(_sm)?(_.*$)/;
  let tmp = element.id.match(id_regex);
  // tmp MUST match!!!
  if (!tmp) {
    console.error("ERROR in [grid] toggle_grid!!!  Bad element id!\n", element);
    return;
  }
  let otherid = tmp[2] ? tmp[1] + tmp[3] : tmp[1] + "_sm" + tmp[3];
  let otherElement = document.getElementById(otherid);
  otherElement.checked = element.checked;

  element.form.value[otherElement.name] = element.form.value[element.name];
}

function buildHtml(grid_obj) {
  let grid_head =
    '<div class="d-flex align-items-center border"><div class="col">Select an answer for each row below:</div>';
  grid_obj.responses.forEach((resp) => {
    grid_head += `<div class="col-1">${resp.text}</div>`;
  });
  grid_head += "</div>";
  let grid_table_body = "";
  grid_obj.questions.forEach((question) => {
    grid_table_body += `<div id="${question.id}" class="d-flex align-items-stretch"><div class="col d-flex align-items-center justify-content-center border">${question.question_text}</div>`;
    grid_obj.responses.forEach((resp, resp_indx) => {
      grid_table_body += `<div class="col-1 d-flex align-items-center justify-content-center border"><input type="${resp.type}" name="${question.id}" id="${question.id}_${resp_indx}" value="${resp.value}" class="grid-input-element show-button"/></div>`;
    });
    grid_table_body += "</div>";
  });

  let small_format = "";
  grid_obj.questions.forEach((question) => {
    small_format += `<div id="${question.id}_sm"><div class="py-4">${question.question_text}</div>`;
    grid_obj.responses.forEach((resp, resp_indx) => {
      small_format += `<div class="text-center"><input type="${resp.type}" class="d-none grid-input-element" name="${question.id}_sm" id="${question.id}_sm_${resp_indx}" value="${resp.value}"/><label class="w-100" for="${question.id}_sm_${resp_indx}">${resp.text}</label></div>`;
    });
    small_format += "</div>";
  });
  let html_text = `<form ${grid_obj.args} class="container question" hardedit="false" softedit="false">
    ${grid_obj.shared_text}<div class="d-none d-lg-block" style="background-color: rgb(193,225,236)">${grid_head}${grid_table_body}</div><div class="d-lg-none">${small_format}</div>
    <div><input type='submit' class='previous' value='BACK'></input><input type='submit' class='next' value='NEXT'></input></div>
    </form>`;

  return html_text;
}

// note the text should contain the entirity of ONE grid!
// the regex for a grid is /\|grid\|([^|]*?)\|([^|]*?)\|([^|]*?)\|
// you  can use the /g and then pass it to the function one at a time...
export function parseGrid(text) {
  console.log("in parseGrid ", text);

  let grid_obj = {};
  //  look for key elements of the text
  // |grid|id=xxx|shared_text|questions|response|
  let grid_regex = /\|grid\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/;
  let grid_match = text.match(grid_regex);
  if (grid_match) {
    console.log(grid_match);
    grid_obj = {
      original: grid_match[0],
      args: grid_match[1],
      shared_text: grid_match[2],
      question_text: grid_match[3],
      shared_response: grid_match[4],
      questions: [],
      responses: [],
    };
    let question_regex = /\[([A-Z][A-Z0-9_]*)\](.*?);\s*(?=[\[\]])/g;
    let question_matches = grid_obj.question_text.matchAll(question_regex);
    for (const match of question_matches) {
      let question_obj = { id: match[1], question_text: match[2] };
      grid_obj.questions.push(question_obj);
    }

    let rb_cb_regex = /([\[\(])(\w+):([^\]\)]+)[\]\)]/g;
    let response_matches = grid_obj.shared_response.matchAll(rb_cb_regex);
    if (response_matches) {
      for (const match of response_matches) {
        grid_obj.responses.push({
          is_radio: match[1] == "(",
          type: match[1] == "(" ? "radio" : "checkbox",
          value: match[2],
          text: match[3],
        });
      }
    }
  }
  return buildHtml(grid_obj);
}
