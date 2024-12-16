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
function buildHtmlTable(grid_obj, gridButtonDiv) {
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
    <form ${grid_obj.args} class="container question" data-grid="true" ${gridPrompt} role="form">
      <div>${grid_text_displayif(shared_text)}</div>
      <span id="srFocusHelper" tabindex="-1" style="position: absolute; width: 1px; height: 1px; overflow: hidden;"></span>
        <table class="quest-grid table-layout table">`;
  
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

  grid_html += `</tbody></table>${gridButtonDiv}</form>`;
  
  return grid_html;
}

// note the text should contain the entirity of ONE grid!
// the regex for a grid is /\|grid\|([^|]*?)\|([^|]*?)\|([^|]*?)\|
// you  can use the /g and then pass it to the function one at a time...
export function parseGrid(text, ...args) {
  const gridButtonDiv = args.pop();
  //const button_text_obj = args.pop();
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
    });

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

  return buildHtmlTable(grid_obj, gridButtonDiv);
}
