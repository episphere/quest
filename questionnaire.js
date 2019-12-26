function clearSelection(inputElement) {
    var state = inputElement.checked;
    var cb = inputElement.parentElement.querySelectorAll("input[type='checkbox']");
    if (inputElement.value == 99) {
        for (var x of cb) {
            if (x != inputElement) {
                x.checked = false;
                x.clear = inputElement.id;
                x.onclick = function() {
                    clearElement = document.getElementById(this.clear);
                    clearElement.checked = false;
                }
            }
        }
    }
}

// norp == next or previous button (which ever is clicked...)
function next(norp) {

    // the default next question is ... well next...
    var nextElement = norp.parentElement.nextElementSibling
    norp.parentElement.classList.remove("active");

    // does the selected response element have a skip???
    var skipTo = checkForSkips(norp.parentElement);
    if (skipTo != null) {
        nextElement = document.getElementById(skipTo);
    }

    // should we really display the next element???
    if (nextElement.hasAttribute("showIfId")) {
        var acceptableValues = nextElement.getAttribute("values").split(",");
        var checkValueFromElement = document.getElementById(nextElement.getAttribute("showIfId"));
        var selectedValues = getSelected(checkValueFromElement);

        var intersection = selectedValues.filter(x => acceptableValues.includes(x))
        if (intersection.length == 0) {
            console.log("[" + acceptableValues + "] does not contain any of the selectedValues: " + selectedValues + " so I am skipping " + nextElement.id + " and going to " + nextElement.nextElementSibling.id);
            nextButton = nextElement.querySelector(".next");
            if (nextButton != null) {
                nextElement = next(nextButton);
                return (nextElement);
            } else {
                nextElement = nextElement.nextElementSibling;
            }

        }
    }

    nextElement.classList.add("active");
    return (nextElement)
}

function prev(norp) {
    // var prevElement = norp.parentElement.previousSibling
    // norp.parentElement.classList.add("active")
    // prevElement.classList.remove("active")
    // return (prevElement);
}

function checkForSkips(questionElement) {
    selectedElements = getSelected(questionElement, true);
    // if more than 1 element is selected...
    // cannot be a skip....
    if (selectedElements.length == 1) {
        if (selectedElements[0].hasAttribute("skipTo")) {
            return selectedElements[0].getAttribute("skipTo");
        }
    }
    return (null);
}

function getSelected(questionElement, returnElement = false) {
    // check for checkboxes...
    var cb = questionElement.querySelectorAll("input[type='checkbox']");
    if (cb.length > 0) {
        return (getChecked(cb, returnElement))
    }
    // check for radiogroup
    cb = questionElement.querySelectorAll("input[type='radio']");
    if (cb.length > 0) {
        return (getChecked(cb, returnElement))
    }

    var rv = [];
    return (rv)
}

function getChecked(elementArray, returnElement) {
    var values = [];
    for (var x of elementArray) {
        if (x.checked) {
            if (returnElement) {
                values.push(x)
            } else {
                values.push(x.value)
            }
        }
    }
    return (values)
}



// // this is the user profile
// var userProfile = { firstName: "Daniel", lastName: "Russ", age: "40" };
// console.log(userProfile)
// for (var v in userProfile) {
//     console.log(v + "  " + userProfile[v]);
//     document.querySelectorAll('[name=' + v + ']').forEach(x => x.innerHTML = userProfile[v]);
// }
// document.querySelector(".question").classList.add("active");