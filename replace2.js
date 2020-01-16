// var fs = require('fs');
// var lineReader = require('line-reader');

var z = "";
var qid = "";

// fs.readFile('textfile.z', 'utf8',
//     function(err, contents) {
//         transform(contents);
//     });

transform = function() {
  // ini
};

transform.render = contents => {
  // hey, lets de-lint the contents..
  // convert (^|\n{2,}Q1. to [Q1]
  // note:  the first question wont have the
  // \n\n so we need to look at start of string(^)
  //    contents = contents.replace(/(\n{2,})(\w+)\./msg, "$1[$2]")
  contents = contents.replace(/(?<=\n{2,})(\w+)\./gms, "[$1]");
  contents = contents.replace(/(\n{2,})([^\[])/gms, "$1[_#]$2");
  contents = contents.replace(/\/\*.*\*\//gms, "");
  contents = contents.replace(/\/\/.*/gm, "");
  // contents = contents.replace(/\[DISPLAY IF .*\]/gms, "");

  //console.log(contents)
  // first let's deal with breaking up questions..
  // a question starts with the [ID1] regex pattern
  // and end with the next pattern or the end of string...

  // start with a '['
  // then the first character must be a capital letter
  // followed by zero or more capital letters/digits or an _
  // note: we want this possessive (NOT greedy) so add a ?
  //       otherwise it would match the first and last square bracket

  let regEx = new RegExp(
    "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)\\](.*?)(?=\\[[A-Z])",
    "msg"
  );

  contents = contents.replace(regEx, function(x, y, z) {
    // z = z.replace(/\/\*[\s\S]+\*\//g, "");
    // z = z.replace(/\/\/.*\n/g, "");

    z = z.replace(/\n/g, "<br>");

    z = z.replace(/\[_#\]/g, "");

    y = y.replace(/\[DISPLAY IF .*\]/g, "");

    // ---------------
    // z = z.replace(
    //   /\`\`\`(.*)\`\`\`/gms,
    //   "<script type='text/javascript'>$1</script>"
    // );
    // ----------------
    let rv =
      "<div class='question' style='font-weight: bold' id='" +
      y +
      "'>" +
      z +
      "<input type='button' onclick='prev(this)' class='previous' value='previous'></input>\n" +
      "<input type='button' onclick='next(this)' class='next' value='next'></input>" +
      "<br>" +
      "<br>" +
      "</div>";

    let hardBool = y.endsWith("!");
    let softBool = y.endsWith("?");
    if (hardBool || softBool) {
      y = y.slice(0, -1);
    }

    // replace |__|__|__|__|  with a number box...
    z = z
      .trim()
      .replace(
        /\|(__\|){4,}/g,
        "<input type='number' name='" + y + "'></input>"
      );

    // replace |__|__|  with a number box...
    z = z
      .trim()
      .replace(
        /\|(__\|){2,}/g,
        "<input type='number' name='" + y + "'></input>"
      );

    // -------------
    // z = z.replace(/\_{4,}/g, "<input name='" + y + "'></input>");
    // -------------

    // replace |__|  with an input box...
    z = z.trim().replace(/\|__\|/g, "<input name='" + y + "'></input>");

    // replace [text box:xxx] with a textbox
    z = z.replace(
      /\[text\s?box\]|\[text\s?box:\s?(\w+)?\]|\|___\|/g,
      "<textarea name='$1'></textarea>"
    );

    // replace (XX) with a radio button...
    z = z.replace(
      /(?<=\W)\((\d+)\)([^<\n]*)|\(\)/g,
      "<br><input type='radio' name='" +
        y +
        "' value='$1' id='" +
        y +
        "_$1'></input><label style='font-weight: normal' for='" +
        y +
        "_$1'>$2</label>"
    );

    // replace [a-zXX] with a checkbox box...
    z = z.replace(
      /\s*\[(\w*)\]([^<\n]*)|\[\]|\*/g,
      "<br><input type='checkbox' name='" +
        y +
        "' value='$1' id='" +
        y +
        "_$1' onclick='clearSelection(this)'></input><label style='font-weight: normal' for='" +
        y +
        "_$1'>$2</label>"
    );

    // replace user profile variables...
    z = z.replace(/{\$u:(\w+)}/, "<span name='$1'>$1</span>");

    // //create modal
    // z = z.replace(
    //   /{(\w+)}/gms,
    //   ` <!-- Button trigger modal -->
    // <button type="button" class="btn btn-primary" data-toggle="modal" data-target="#exampleModal">
    //     $1
    // </button>

    //   <!-- Modal -->
    //   <div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
    //     <div class="modal-dialog" role="document">
    //       <div class="modal-content">
    //         <div class="modal-header">
    //           <h5 class="modal-title" id="exampleModalLabel">Modal title</h5>
    //           <button type="button" class="close" data-dismiss="modal" aria-label="Close">
    //             <span aria-hidden="true">&times;</span>
    //           </button>
    //         </div>
    //         <div class="modal-body">
    //           ...
    //         </div>
    //         <div class="modal-footer">
    //           <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    //           <button type="button" class="btn btn-primary">Save changes</button>
    //         </div>
    //       </div>
    //     </div>
    //   </div>`
    // );
    // replace next question  < -> > with hidden...
    z = z.replace(
      /<\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' id='" +
        y +
        "_default' name='" +
        y +
        "' skipTo=$1 checked>"
    );

    // handle skips
    z = z.replace(
      /<input (.*?)><\/input><label(.*?)>(.*?)\s*->\s*(.*?)<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );

    rv =
      "<div class='question' style='font-weight: bold' id='" +
      y +
      "' hardEdit='" +
      hardBool +
      "' softEdit='" +
      softBool +
      "'>" +
      z +
      "<input type='button' onclick='prev(this)' class='previous' value='previous'></input>\n" +
      "<input type='button' onclick='nextPage(this)' class='next' value='next'></input>" +
      "<br>" +
      "<br>" +
      "</div>";

    return rv;
  });

  // handle the display if case...
  contents = contents.replace(
    /\[DISPLAY IF\s*([A-Z][A-Z0-9+]*)\s*=\s*\(([\w,\s]+)\)\s*\]\s*<div (.*?)>/gms,
    "<div $3 showIfId='$1' values='$2'>"
  );

  // remove the first previous button...
  contents = contents.replace(
    /<input type='button'.*?class='previous'.*?\n/,
    ""
  );
  // remove the last next button...
  contents = contents.replace(
    /<input type='button'.*class='next'.*?\n(?=<\/div>\n\[END\])/,
    ""
  );

  // remove the hidden end tag...
  contents = contents.replace("[END]", "");

  // add the HTML/HEAD/BODY tags...
  return (contents =
    "<html><head></head><body>" +
    contents +
    '\n<script src="questionnaire.js"></script></body>');

  console.log("\n\n\n" + contents);
};

transform.tout = function(fun, tt = 500) {
  if (transform.tout.t) {
    clearTimeout(transform.tout.t);
  }
  transform.tout.t = setTimeout(fun, tt);
};
