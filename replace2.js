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
      "<form class='question' style='font-weight: bold' id='" +
      y +
      "'>" +
      z +
      "<input type='button' onclick='prev(this)' class='previous' value='previous'></input>\n" +
      "<input type='button' onclick='next(this)' class='next' value='next'></input>" +
      "<br>" +
      "<br>" +
      "</form>";

    let hardBool = y.endsWith("!");
    let softBool = y.endsWith("?");
    if (hardBool || softBool) {
      y = y.slice(0, -1);
    }

    // replace user profile variables...
    z = z.replace(/{\$u:(\w+)}/, "<span name='$1'>$1</span>");

    // replace {$id} with span tag
    z = z.replace(/\{\$(\w+)\}/g, `<span forId='$1'>${"$1"}</span>`);

    // replace #YN with Yes No input
    z = z.replace(
      /#YN/g,
      "<br><input type='radio' name='" +
        y +
        "' id='" +
        y +
        "_yes' value='1'></input><label style='font-weight: normal; padding-left:5px' for='" +
        y +
        "_yes'>Yes</label><br><input type='radio' name='" +
        y +
        "' id='" +
        y +
        "_no' value='0'></input><label style='font-weight: normal; padding-left:5px' for='" +
        y +
        "_no'>No</label>"
    );

    // replace |@| with an email input
    z = z.replace(/\|@\|((\w+)\|)?/g, fEmail);
    function fEmail(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = y + "_email";
      } else {
        elId = z1;
      }
      return `<input type='email' id='${elId}'></input>`;
    }

    // replace __/__/__ with a date input
    // z = z.replace(
    //   /\_\_\/\_\_\/\_\_((\w+)\|)?/g,
    // "<input type='date' id='" + "$2" + "'></input>"
    // );
    z = z.replace(/\_\_\/\_\_\/\_\_((\w+)\|)?/g, fDate);
    function fDate(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = y + "_date";
      } else {
        elId = z1;
      }
      return `<input type='date' id='${elId}'></input>`;
    }

    // replace (###)-###-#### with phone input
    // z = z.replace(
    //   /\(###\)-###-####((\w+)\|)?/g,
    // "<input type='tel' name='phone' id='" +
    //   "$2" +
    //   "' pattern='(([0-9]{3})|[0-9]{3})-[0-9]{3}-[0-9]{4}' required></input>"
    // );
    z = z.replace(/\(###\)-###-####((\w+)\|)?/g, fPhone);
    function fPhone(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = y + "_phone";
      } else {
        elId = z1;
      }
      return `<input type='tel' name='phone' id='${elId}' pattern='(([0-9]{3})|[0-9]{3})-[0-9]{3}-[0-9]{4}' required></input>`;
    }

    // replace (###)-###-#### with SSN input
    z = z.replace(
      /\|###-##-####\|/g,
      `<input type='text' id='${y}_SSN'pattern='[0-9]{3}-[0-9]{2}-[0-9]{4}' required></input>`
    );

    // replace |state| with state dropdown
    z = z.replace(
      /\|state\|((\w+)\|)?/g,
      `
      <select id='$2'>
      <option value='' disabled selected>Chose a state: </option>
      <option value='AL'>Alabama</option>
      <option value='AK'>Alaska</option>
      <option value='AZ'>Arizona</option>
      <option value='AR'>Arkansas</option>
      <option value='CA'>California</option>
      <option value='CO'>Colorado</option>
      <option value='CT'>Connecticut</option>
      <option value='DE'>Delaware</option>
      <option value='DC'>District Of Columbia</option>
      <option value='FL'>Florida</option>
      <option value='GA'>Georgia</option>
      <option value='HI'>Hawaii</option>
      <option value='ID'>Idaho</option>
      <option value='IL'>Illinois</option>
      <option value='IN'>Indiana</option>
      <option value='IA'>Iowa</option>
      <option value='KS'>Kansas</option>
      <option value='KY'>Kentucky</option>
      <option value='LA'>Louisiana</option>
      <option value='ME'>Maine</option>
      <option value='MD'>Maryland</option>
      <option value='MA'>Massachusetts</option>
      <option value='MI'>Michigan</option>
      <option value='MN'>Minnesota</option>
      <option value='MS'>Mississippi</option>
      <option value='MO'>Missouri</option>
      <option value='MT'>Montana</option>
      <option value='NE'>Nebraska</option>
      <option value='NV'>Nevada</option>
      <option value='NH'>New Hampshire</option>
      <option value='NJ'>New Jersey</option>
      <option value='NM'>New Mexico</option>
      <option value='NY'>New York</option>
      <option value='NC'>North Carolina</option>
      <option value='ND'>North Dakota</option>
      <option value='OH'>Ohio</option>
      <option value='OK'>Oklahoma</option>
      <option value='OR'>Oregon</option>
      <option value='PA'>Pennsylvania</option>
      <option value='RI'>Rhode Island</option>
      <option value='SC'>South Carolina</option>
      <option value='SD'>South Dakota</option>
      <option value='TN'>Tennessee</option>
      <option value='TX'>Texas</option>
      <option value='UT'>Utah</option>
      <option value='VT'>Vermont</option>
      <option value='VA'>Virginia</option>
      <option value='WA'>Washington</option>
      <option value='WV'>West Virginia</option>
      <option value='WI'>Wisconsin</option>
      <option value='WY'>Wyoming</option>
    </select>`
    );

    // replace |__|__|  with a number box...
    // z = z
    //   .trim()
    //   .replace(
    //     /\|(__\|){2,}((\w+)\|)?/g,
    // "<label id='input" +
    //   "$3" +
    //   "' for='" +
    //   "$3" +
    //   "'><input id='" +
    //   "$3" +
    //   "' type='number' name='" +
    //   y +
    //   "' ></input></label>"
    //   );
    z = z.replace(/\|(__\|){2,}((\w+)\|)?/g, fNum);
    function fNum(w1, x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = y + "_num";
      } else {
        elId = z1;
      }
      return (
        "<label id='input" +
        elId +
        "' for='" +
        elId +
        "'><input id='" +
        elId +
        "' type='number' name='" +
        y +
        "' ></input></label>"
      );
    }

    // -------------
    // z = z.replace(/\_{4,}/g, "<input name='" + y + "'></input>");
    // -------------

    // replace |__| or [text box:xxx] with an input box...
    z = z.replace(
      /\[text\s?box\]|\[text\s?box:\s?(\w+)?\]|\|__\|((\w+)\|)?/g,
      fText
    );
    function fText(w1, x1, y1, z1) {
      let elId = "";
      if (x1 == undefined && z1 == undefined) {
        elId = y + "_text";
      } else {
        elId = x1 == undefined ? z1 : x1;
      }
      return (
        "\n<label for='" +
        elId +
        "'><input type='text' id='" +
        elId +
        "' name='" +
        y +
        "'></input></label>"
      );
    }

    // replace |___| with a textbox...
    z = z.replace(/\|___\|((\w+)\|)?/g, fTextArea);
    function fTextArea(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = y + "_ta";
      } else {
        elId = z1;
      }
      return `<textarea id='${elId}'></textarea>`;
    }

    // replace (XX) with a radio button...
    z = z.replace(
      /(?<=\W)\((\d+)\)([^<\n]*)|\(\)/g,
      "<br><input type='radio' name='" +
        y +
        "' value='$1' id='" +
        y +
        "_$1' onclick='clearSelection(this)'></input><label style='font-weight: normal; padding-left:5px' for='" +
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
        "_$1' onclick='clearSelection(this)'></input><label style='font-weight: normal; padding-left:5px' for='" +
        y +
        "_$1'>$2</label>"
    );

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
      "<form class='question' style='font-weight: bold' id='" +
      y +
      "' hardEdit='" +
      hardBool +
      "' softEdit='" +
      softBool +
      "'>" +
      z +
      "<input type='button' onclick='prev(this)' class='previous' value='Previous'></input>\n" +
      "<input type='button' onclick='nextClick(this)' class='next' value='Next'></input>" +
      "</form>";

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
