console.log('quest.js loaded')

quest=function(){
    //ini
}

quest.render=(txt)=>{
    var html=''
    var txt0=txt

    // remove blocked out
    txt=txt.replace(/\/\*[\s\S]+\*\//g,'')
    txt=txt.replace(/\/\/.*\n/g,'')

    // separate  questions
    txt = txt.split(/\n\n/).map(qq=>{
        qq=qq.split('\n')
        if(qq.length==1){
            //html += `<h3>${qq[0]} <span style="font-size:small;cursor:hand;color:blue">[hide]</span></h3>`
            html += `<h3>${qq[0]}</h3>`
        }else if(qq.length>1){
            html += `<p><b>${qq[0]}</b><br>`
            qq.slice(1).forEach(q=>{
                 html += `${q}<br>`
            })
            html += '</p>'
        }
    })

    // html elements
    html = html.replace(/\[\]/g,'<input type="checkbox">')
    html = html.replace(/\|__\|/g,'<input>')
    html = html.replace(/\|___\|/g,'<textarea></textarea>')

    return html+'<hr>'//+txt0
}