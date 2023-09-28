import { transform } from "../replace2.js";
import { moduleParams } from "../questionnaire.js";

const assert=chai.assert;
const testURL1="https://raw.githubusercontent.com/episphere/questionnaire/main/mockSurvey.txt"
const questdiv = document.getElementById("questdiv")
async function callTransform(obj,divId){
    try{
        await transform.render(obj,divId)
    }catch(error){
        console.error(error)
    }
}

afterEach( function(){
    questdiv.innerText=""
});

describe("import tests",function(){
    it("transform.replace is not null",function(){
        assert.exists(transform,"The transform module is null/undefined")
        assert.exists(transform.render,"The transform module is null/undefined")
    })
})

describe("input tests",function(){
    const storefunc = (x)=>null;
    const retrieveFunc = ()=>"hi";
    describe("test new input objects",function(){
        it("should accept just a URL+div", async function () {
            let obj = { url: testURL1 }
            return callTransform(obj, "questdiv")
                .then( () => assert.equal(moduleParams.url, testURL1))
        })
        it("should accept store and retrieve functions", async function () {
            let obj = {
                url: testURL1,
                store: storefunc,
                retrieve: retrieveFunc
            }
            return callTransform(obj, "questdiv")
                .then(() => {
                    assert.equal(moduleParams.store.toString(), storefunc.toString())
                    assert.equal(moduleParams.retrieve.toString(), retrieveFunc.toString())
                })

        })

        it("should accept handle stylesheets", async function () {
            const styleURL = "../Style1.css"
            let obj = {
                url: testURL1,
                style: styleURL
            }
            await callTransform(obj, "questdiv")
            assert.equal(moduleParams.style, styleURL)
        })
        it("should accept handle no stylesheet",async function(){
            const styleURL = false
            try {
                await transform.render({
                    url: testURL1,
                    style: styleURL
                }, "questdiv")              
            } catch (error) {
                console.error(error)
            }
            assert.notExists(moduleParams.style, 'style should not be defined')
        })
    })

})
