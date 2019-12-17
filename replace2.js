// var fs = require('fs');
// var lineReader = require('line-reader');

var txt = "";
var qid = "";

// fs.readFile('textfile.txt', 'utf8',
//     function(err, contents) {
//         transform(contents);
//     });

function transform(contents) {

    //console.log(contents)
    // first let's deal with breaking up questions..
    // a question starts with the [ID1] regex pattern
    // and end with the next pattern or the end of string...

    // start with a '['
    // then the first character must be a capital letter
    // followed by zero or more capital letters/digits or an _
    // note: we want this possessive (NOT greedy) so add a ?
    //       otherwise it would match the first and last square bracket

    var regEx = new RegExp('\\[([A-Z][A-Z0-9_]*)\\](.*?)(?=\\[[A-Z]|<END>)', "msg")

    var contents = contents.replace(regEx, function(x, y, z) {
        console.log();
        // replace |__|__|  with a number box...
        z = z.trim().replace(/\|(__\|)+/, "<input type='number' name='" + y + "'></input>");

        // replace [text box:xxx] with a textbox
        z = z.replace(/\[text\s?box:?(\w+)?\]/g, "<textarea name='$1'></textarea>")

        // replace (XX) with a radio box...
        z = z.replace(/\((\w+)\)([^<\n]*)/g, "<input type='radio' name='" + y + "' value='$1' id='" + y + "_$1'></input><label for='" + y + "_$1'>$2</label>");

        // replace [a-zXX] with a checkbox box...
        z = z.replace(/\[(\w+)\]([^<\n]*)/g, "<input type='checkbox' name='" + y + "' value='$1' id='" + y + "_$1'></input><label for='" + y + "_$1'>$2</label>");

        // replace user profile variables...
        z = z.replace(/{\$u:(\w+)}/, "<span name='$1'>$1</span>");

        // handle skips
        z = z.replace(/<input (.*?)><\/input><label(.*?)>(.*?)\s*->\s*(.*?)<\/label>/g, "<input $1 skipTo='$4'></input><label $2>$3</label>")

        var rv =
            "<div class='question' id='" + y + "'>" + z + "\n" +
            "<input type='button' onclick='prev(this)' class='previous' value='previous'></input>\n" +
            "<input type='button' onclick='next(this)' class='next' value='next'></input>\n" +
            "</div>\n";

        return (rv)
    });

    // handle the display if case...
    contents = contents.replace(/\[DISPLAY IF\s*([A-Z][A-Z0-9+]*)\s*=\s*\(([\w,\s]+)\)\s*\]\s*<div (.*?)>/gms, "<div $3 showIfId='$1' values='$2'>");

    // remove the first previous button...
    contents = contents.replace(/<input.*class='previous'.*?\n/, "");
    // remove the last next button...
    contents = contents.replace(/<input.*class='next'.*?\n(?=<\/div>\n<END>)/, "");

    // remove the hidden end tag...    
    contents = contents.replace("<END>", "");

    // add the HTML/HEAD/BODY tags...
    return contents = '<html><head><link rel="stylesheet" type="text/css" href="Questionnaire.css"></head><body>' + contents + '\n<script src="questionnaire.js"></script></body>';

    console.log("\n\n\n" + contents);
}