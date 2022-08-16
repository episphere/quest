import { transform } from "../replace2.js"



describe("Simple Mathjs tests", function () {

    let obj = {}
    obj.text = `
        [Q1]  
        lala -- Enter a number |__|__|id=lala min=1 max=10| 
        lele -- Enter a number |__|__|id=lele min=10 max=20|
        (1) choice 1 
        (2) choice 2 
        (3) choice 3
        [END] bye
        `;
    transform.render(obj, "out")

    document.getElementById("lala").value = 4
    document.getElementById("lele").value = 14
    document.getElementById("Q1_2").checked = true

    describe("existance checks", function () {
        it("should exist", function () {
            assert.isTrue(math.exists("lala"))
            assert.isTrue(math.exists("lele"))
            assert.isFalse(math.exists("doggone"))
        });
        it("all should exist", function () {
            assert.isTrue(math.allExist("lala", "lele"))
            assert.isFalse(math.allExist("lala", "lele", "doggone"))
        })
        it("some should exist", function () {
            assert.isTrue(math.someExist("lala", "doggone", "goup"))
            assert.isFalse(math.allExist("doggone", "goup"))
        })
        it("should not exist", function () {
            assert.isTrue(math.doesNotExist("doggone"))
            assert.isTrue(math.doesNotExist("goup"))
            assert.isTrue(math.noneExist("doggone", "goup"))
            assert.isFalse(math.doesNotExist("lala"))
            assert.isFalse(math.doesNotExist("lele"))
        })

    })

    describe("value tests:", function () {
        it("valueIsOne of should find discrete values", function () {
            assert.isTrue(math.valueIsOneOf("lala", "1", "2", "3", "4"))
            assert.isTrue(math.valueIsOneOf("lele", 11, 12, 13, 14))
        })
        it("valueIsBetween should find numbers between x and y", function () {
            assert.isTrue(math.valueIsBetween(1, 10, "lala"))
            assert.isTrue(math.valueIsBetween(10, 20, "lele"))
        })
        it("valueIsBetween should handle multiple id at once", function () {
            assert.isTrue(math.valueIsBetween(1, 20, "lala", "lele"))
        })


        it("should equal 4 or 14", function () {
            assert.equal(math._value("lala"), 4)
            assert.equal(math._value("lele"), 14)
            assert.equal(math.valueOrDefault("lala", -1), 4)
            assert.equal(math.valueOrDefault("lele", -1), 14)
            assert.equal(math.valueOrDefault("doggone", -1), -1)
        })

        it("choice 2 should be selected", function () {
            assert.isTrue(math.isSelected("Q1_2"));
            assert.isTrue(math.someSelected("Q1_1", "Q1_2", "Q1_3"))
        })
    })

})