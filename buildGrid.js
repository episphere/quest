
export const grid_replace_regex = /\|grid(\!|\?)*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g;

//NOTE: This function is not used in the current implementation
export function firstFun(event) {
  event.preventDefault();
}

//NOTE: This function is not used in the current implementation
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

// Builds the HTML Table for a grid question (radio-selectable multi-option fields).
function buildHtmlTable(grid_obj){
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

  // replace displayif and piped variables...
  let shared_text = grid_text_displayif(grid_obj.shared_text)
  shared_text = grid_replace_piped_variables(shared_text)  
  
  // Begin form and set up accessibility description.
  // Ask the main question, then begin the table structure (this semantic HTML helps screen readers).
  let grid_html = `
      <form ${grid_obj.args} class="container question" data-grid="true" ${gridPrompt} aria-describedby="formDescription" role="form">
        <div id="formDescription" class="sr-only" aria-live="polite">Please interact with the table below to answer the questions.</div>
        <div>${grid_text_displayif(shared_text)}</div>
        <table class="quest-grid table-layout">`;
  
  // Build the table header row with the question text and response headers. Start with a placeholder for the row header.
  grid_html += '<thead class="hr" role="rowgroup"><tr><th class="nr hr"></th>';
  grid_obj.responses.forEach((resp) => {
    const header_text = resp.text;
    grid_html += `<th class="hr" scope="col" data-header="${header_text}">${header_text}</th>`;
  });
  grid_html += '</tr></thead><tbody role="rowgroup">';
  
  // now lets handle each question...
  grid_obj.questions.forEach((question) => {
    // check for row-level display if. Then check for displayif inside row text
    const displayif = question.displayif ? `data-displayif="${encodeURIComponent(question.displayif)}"` : '';
    const piped_question_text = grid_text_displayif(question.question_text);    
    const question_text = grid_replace_piped_variables(piped_question_text);

    // Start the row for the question, then add the row header (question text)
    grid_html +=
      `<tr role="row" data-question-id="${question.id}" data-gridrow="true" aria-labelledby="qtext${question.id}" ${displayif}>
        <th scope="row" id="qtext${question.id}" class="nr">${question_text}</th>`;


    // All selectable responses for a given question share the same 'name' attribute to link them as a group
    // The label is used as a click target for the radio/checkbox input
    grid_obj.responses.forEach((resp, resp_index) => {
        grid_html += `
          <td class="response" data-question-id="${question.id}" data-header="${resp.text}" role="gridcell">
            <input type="${resp.type}" name="${question.id}" id="${question.id}_${resp_index}" value="${resp.value}" data-gridcell="true" data-grid="true">
            <label for="${question.id}_${resp_index}" id="label${question.id}_${resp_index}" class="custom-label">${resp.text}</label>
          </td>`;
    });

    // Close the row for the question
    grid_html += `</tr>`;
  });
  
  grid_html+=`</tbody></table>
    <div class="container">
      <div class="row">
        <div class="col-md-3 col-sm-12">
          <button type="submit" class="previous w-100" aria-label="Back to the previous section" data-click-type="previous">Back</button>
        </div>
        <div class="col-md-6 col-sm-12">
          <button type="submit" class="reset w-100" aria-label="Reset answer for this question" data-click-type="reset">Reset Answer</button>
        </div>
        <div class="col-md-3 col-sm-12">
          <button type="submit" class="next w-100" aria-label="Go to the next section" data-click-type="next">Next</button>
        </div>
      </div>
    </div>
  </form>`;

  return grid_html;
}

function buildHtml_og(grid_obj) {
  let grid_head =
    '<div class="d-flex align-items-center border"><div class="col">Select an answer for each row below:</div>';
  grid_obj.responses.forEach((resp) => {
    grid_head += `<div class="col-1">${resp.text}</div>`;
  });
  grid_head += "</div>";
  let grid_table_body = "";
  grid_obj.questions.forEach((question) => 
  {
    // check for row-level display if
    let displayif = question.displayif ? ` displayif="${question.displayif}"` : '';

    // check for displayif inside row text
    let question_text = grid_text_displayif(question.question_text)

    grid_table_body += `<div id="${question.id}" ${displayif} data-gridrow=true class="d-flex align-items-stretch"><div class="col d-flex align-items-left justify-content-left border"><span>${question_text}<span></div>`;
    grid_obj.responses.forEach((resp, resp_indx) => {
      grid_table_body += `<div class="col-1 d-flex align-items-center justify-content-center border"><input gridcell type="${resp.type}" name="${question.id}" id="${question.id}_${resp_indx}" value="${resp.value}" grid class="grid-input-element show-button"/></div>`;
    });
    grid_table_body += "</div>";
  });

  let small_format = "";
  grid_obj.questions.forEach((question) => {
    let displayif = question.displayif ? ` displayif="${question.displayif}"` : '';
    // check for displayif inside question text
    let question_text = grid_text_displayif(question.question_text)
    small_format += `<div id="${question.id}_sm" ${displayif}><div class="pt-4">${question_text}</div>`;
    grid_obj.responses.forEach((resp, resp_indx) => {
      small_format += `<div class="response text-center"><input data-is-small-grid-cell="1" type="${resp.type}" class="d-none grid-input-element" name="${question.id}_sm" id="${question.id}_sm_${resp_indx}" value="${resp.value}"  aria-label='(${question.question_text}, ${resp.text})'/><label class="w-100" for="${question.id}_sm_${resp_indx}">${resp.text}</label></div>`;
    });
    small_format += "</div>";
  });
  let gridPrompt = "hardedit='false' softedit='false'";

  if (grid_obj.prompt) {
    if (grid_obj.prompt === '!') {
      gridPrompt = "hardedit='true' softedit='false'";
    }
    else if (grid_obj.prompt === '?') {
      gridPrompt = "hardedit='false' softedit='true'";
    }
  }
  //remove , from display if for form if it exists
  grid_obj.args = grid_obj.args.replace(",displayif", " displayif");
  let shared_text = grid_text_displayif(grid_obj.shared_text)
  shared_text = grid_replace_piped_variables(shared_text)
  let html_text = `<form ${grid_obj.args} class="container question" grid ${gridPrompt}>
  ${shared_text}<div class="d-none d-lg-block" data-grid="large" style="background-color: rgb(193,225,236)">
  ${grid_head}${grid_table_body}</div><div class="d-lg-none" data-grid="small">${small_format}</div>
  <div class="container">
    <div class="row">
      <div class="col-md-3 col-sm-12">
        <input type='submit' class='previous w-100' value='BACK'/>
      </div>
      <div class="col-md-6 col-sm-12">
        <input type='submit' class='reset w-100' value='RESET ANSWER'/>
      </div>
      <div class="col-md-3 col-sm-12">
        <input type='submit' class='next w-100' value='NEXT'/>
      </div>
    </div>
  </div>
  </form>`;

  //for some reason spacing needs to be removed
  return html_text.replace(/(\r\n|\n|\r)/gm, "");;
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
  return buildHtmlTable(grid_obj);
}
