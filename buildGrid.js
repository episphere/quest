import { translate } from "./common.js";

export const grid_replace_regex = /\|grid(\!|\?)*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g;

export function firstFun(event) {
  event.preventDefault();
}
export function toggle_grid(event) {
  event.preventDefault();
  let element = event.target;
  let id_regex = /(^.*?)(_sm)?(_\d+$)/;
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

  const isElementSmall = element.dataset.isSmallGridCell === "1";
  const isOtherElementSmall = otherElement.dataset.isSmallGridCell === "1";
  if (isElementSmall) {
    delete element.form.value[element.name];
  }
  if (isOtherElementSmall) {
    delete element.form.value[otherElement.name];
  }
}

function grid_replace_piped_variables(txt){
  txt = txt.replace(/\{\$([ue]:)?([^}]+)}/g, (all, type, varid) => {
    return `<span data-gridreplacetype=${type == "e:" ? "eval" : "_val"} data-gridreplace=${encodeURIComponent(varid)}></span>`
  });
  txt = txt.replace(' <span', '&nbsp;<span')
  return txt
}
function grid_text_displayif(original_text){
  let question_text = original_text
  let dif_regex = /%displayif=([^%]+)%([^%]+)%/g
  if (dif_regex.test(question_text)) {      
    question_text = question_text.replace(dif_regex,(match,p1,p2)=>{
      return `<span displayif="${encodeURIComponent(p1)}" class="grid-displayif"> ${p2}</span>`
    })
  }
  return question_text;
}

function buildHtml(grid_obj){
  // is there a hard/soft edit?
  let gridPrompt = "hardedit='false' softedit='false'";
  if (grid_obj.prompt) {
    if (grid_obj.prompt === '!') {
      gridPrompt = "hardedit='true' softedit='false'";
    }
    else if (grid_obj.prompt === '?') {
      gridPrompt = "hardedit='false' softedit='true'";
    }
  }

  let shared_text = grid_text_displayif(grid_obj.shared_text)
  shared_text = grid_replace_piped_variables(shared_text)

  // replace displayif and piped variables...
  let grid_html = `<form ${grid_obj.args} class="container question" data-grid="true" ${gridPrompt}>`
  grid_html+=`<div>${grid_text_displayif(shared_text)}</div>`
  grid_html+='<ul class="quest-grid">'

  // header line...
  grid_html += '<li class="nr hr"></div>';
  grid_obj.responses.forEach((resp,index) => {
    grid_html += `<li class="hr">${resp.text}</div>`;
  });

  // now lets handle each question...
  grid_obj.questions.forEach((question) => {
    // check if there is a displayif for the entire question.  
    let displayif = question.displayif ? `data-displayif="${encodeURIComponent(question.displayif)}"` : '';
    // fill in the question text, replacing any displayif 
    let question_text = grid_text_displayif(question.question_text)
    question_text = grid_replace_piped_variables(question_text)
    grid_html += `<li class="nr" data-question-id="${question.id}" data-gridrow="true" ${displayif}>${question_text}`
    // for each possible response make a grid cell...
    grid_obj.responses.forEach( (resp, resp_indx) => {
      grid_html += `<li class="response" data-question-id="${question.id}"><input name="${question.id}" id="${question.id}_${resp_indx}" value="${resp.value}" type="${resp.type}" data-gridcell="true" data-grid="true"><label for="${question.id}_${resp_indx}">${resp.text}</label></li>`
    })
  })
  grid_html+=`</ul></div>
  <div class="container">
    <div class="row">
      <div class="col-md-3 col-sm-12">
        <input type='submit' class='previous w-100' clickType='back' value=${translate("backButton")}/>
      </div>
      <div class="col-md-6 col-sm-12">
        <input type='submit' class='reset w-100' clickType='reset' value=${translate("resetAnswerButton")}/>
      </div>
      <div class="col-md-3 col-sm-12">
        <input type='submit' class='next w-100' clickType='next' value=${translate("nextButton")}/>
      </div>
    </div>
  </div>
  </form></form>`
  return grid_html
}

// note the text should contain the entirity of ONE grid!
// the regex for a grid is /\|grid\|([^|]*?)\|([^|]*?)\|([^|]*?)\|
// you  can use the /g and then pass it to the function one at a time...
export function parseGrid(text) {
  let grid_obj = {};
  //  look for key elements of the text
  // |grid|id=xxx|shared_text|questions|response|
  let grid_regex = /\|grid(\!|\?)*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/;
  let grid_match = text.match(grid_regex);
  if (grid_match) {
    grid_obj = {
      original: grid_match[0],
      prompt: grid_match[1],
      args: grid_match[2],
      shared_text: grid_match[3],
      question_text: grid_match[4],
      shared_response: grid_match[5],
      questions: [],
      responses: [],
    };
    //need to account for displayif 
    // first check grid-displayif
    let args_regex = /displayif=[\'\"]?((?:[^\'\"].+[^\'\"](?:[^\'\"])))[\"\']?$/mg
    grid_obj.args = grid_obj.args.replace(args_regex,(match,group1)=>{
      return `displayif=${encodeURIComponent(group1)}`
    })
    console.log(grid_obj.args)

    //let question_regex = /\[([A-Z][A-Z0-9_]*)\](.*?);\s*(?=[\[\]])/g;     
    let question_regex = /\[([A-Z][A-Z0-9_]*)(,displayif=[^\]]+)?\](.*?)[;\]]/g;
    let question_matches = grid_obj.question_text.matchAll(question_regex);

    for (const match of question_matches) {
      let displayIf = '';
      if (match[2]) {
        displayIf = match[2].replace(",displayif=", "");
      }
      let question_text = match[3];

      // Issue 403: Dont evaluate the markdown expressions at render time.
      // create a span with the markdown.  When it's time to display
      // the value, then evaluate the markdown.
      question_text = grid_replace_piped_variables(question_text)

      let question_obj = { id: match[1], question_text: question_text, displayif: encodeURIComponent(displayIf) };
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
