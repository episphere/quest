console.log("quest.js loaded");

quest = function() {
    //ini
};

quest.render = txt => {
    var html = "";
    var txt0 = txt;

    // remove blocked out
    txt = txt.replace(/\/\*[\s\S]+\*\//g, "");
    txt = txt.replace(/\/\/.*\n/g, "");

    // separate  questions
    txt = txt.split(/\n\n/).map(qq => {
        qq = qq.split("\n");
        if (qq.length > 1) {
            html += `<div><b>${qq[0]}</b><br>`;
            qq.slice(1).forEach(q => {
                html += `<p>${q}</p>`;
            });
            html += "</div>";
        }
    });

    // ---- html elements ---- //

    while (html.search(/\[[A-Z\s0-9]+]/) != -1) {

        let word = html.match(/\[[A-Z\s0-9]+]/)[0];

        html = html.replace("<div>", "<div id='" + word.substr(1, word.length - 2) + "' class='question'>");

        html = html.replace(word, "")

    }

    html = html.replace(/\[DISPLAY \w*\]/g, "")

    html = html.replace(/... GO TO /g, " -> ");
    html = html.replace(/\* NO RESPONSE | NO RESPONSE/g, "");

    // Create skip tags
    const skips = html.match(/\* NO RESPONSE -> [A-Z0-9]+ | -> [A-Z0-9]+/g);

    if (skips === null) {
        null
    } else {

        for (i = 0; i < skips.length; i++) {
            let word = skips[i];
            html = html.replace(word, "<skip id='" + word.substr(4) + "'>");
        }
    }

    // Check Box []
    html = html.replace(/\*/g, "[]");
    html = html.replace(/\[\]/g, '<input type="checkbox">');

    // Radio Button ()
    html = html.replace(/\(\)/g, '<input type="radio">');


    // Year |__|__|__|__|
    html = html.replace(/\|__\|__\|__\|__\|/g, "|_|");

    // Age |__|__|
    html = html.replace(/\|__\|__\|/g, "|_|");

    // Integer |_|
    html = html.replace(/\|_\|/g, "<input type='number'>");


    // Regular input field |__|
    html = html.replace(/\|__\|/g, "<input>");

    // Text Area |___|
    html = html.replace(/\[text box\]/g, "|___|");
    html = html.replace(/\|___\|/g, "<textarea></textarea>");

    // Phone Number |(###)-###-####|
    html = html.replace(
        /\|\(\###\)\-###-####\|/g,
        "<input type='tel' id='phone' name='phone' pattern='(((d{3}) ?)|(d{3}-))?d{3}-d{4}'>"
    );

    // Social Security |###-##-####|
    html = html.replace(
        /\|###-##-####\|/g,
        "<input type='tel' id='social' name='social' pattern='^(?!219099999|078051120)(?!666|000|9d{2})d{3}(?!00)d{2}(?!0{4})d{4}$'>"
    );

    return html + "<hr>"; //+txt0
};

class Questionnaire {}