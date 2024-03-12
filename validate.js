import { callExchangeValues } from "./questionnaire.js"

export function validateInput(inputElement) {

    let handlers = {
        number: validate_number,
        email: validate_email,
        tel: validate_telephone,
        date: validate_date,
        text: validate_text,
        month: validate_month,
        checkbox: validate_count
    }

    // can't use inputElement.type ==> firefox doesn't accept input.type='month'
    let inputElementType = inputElement.getAttribute("type")
    if (inputElementType in handlers) {
        // clear any old validation error
        clearValidationError(inputElement)
        // if the value is blank, if required error, else it is valid.
        if (inputElement.value.length == 0) {
            if (inputElement.hasAttribute("data-required")) {
                validationError(inputElement, "Please fill out this field.")
            }
            return
        }

        handlers[inputElementType](inputElement)
    } else {
        console.log(`no handle for type: ${inputElementType}`)
        console.log(inputElement)
    }
}

export function clearValidationError(inputElement) {
    if (inputElement &&
        inputElement.nextElementSibling?.classList.contains('validation-container')) {

        let errDiv = inputElement.nextElementSibling;
        errDiv.parentNode.removeChild(errDiv)

        inputElement.classList.remove("invalid");
        inputElement.closest("form").classList.remove("invalid");
    }
}
export function validationError(inputElement, errorMsg) {
    let errSpan = null
    let errDiv = null;

    // either use the current error div
    // or create a new one...
    if (inputElement &&
        inputElement.nextElementSibling?.classList.contains('validation-container')) {
        errDiv = inputElement.nextElementSibling;
        errSpan = inputElement.nextElementSibling.firstChild;
    } else {
        errDiv = document.createElement("div")
        errDiv.classList.add('validation-container');
        errSpan = document.createElement("span")

        // styling should be performed by CSS
        errDiv.style.minHeight = "30px";
        errSpan.style.height = "inherit";
        errSpan.style.color = "red";

        errDiv.appendChild(errSpan);
        inputElement.insertAdjacentElement("afterend", errDiv);
    }

    errSpan.innerText = errorMsg
    inputElement.classList.add("invalid");
    inputElement.closest("form").classList.add("invalid");
}

function validate_number(inputElement) {
    console.log("in validate number")
    callExchangeValues(inputElement)
    let belowMin =
        inputElement.dataset.min &&
        math.evaluate(
            `${inputElement.value} < ${inputElement.dataset.min}`
        )
    let aboveMax =
        inputElement.dataset.max &&
        math.evaluate(
            `${inputElement.value} > ${inputElement.dataset.max}`
        )

    if (belowMin) {
        validationError(inputElement, `Value must be greater than or equal to ${inputElement.dataset.min}.`)
    } else if (aboveMax) {
        validationError(inputElement, `Value must be less than or equal to ${inputElement.dataset.max}.`)
    } else {
        clearValidationError(inputElement)
    }

}

function validate_month(inputElement) {
    console.log("in validate_month", inputElement)

    // because type="month" is not supported on firefox be careful with the input...
    let value = inputElement.value.trim();
    // if we have a value, and it does not match a date
    if (value.length > 0 && !/^\d{4}-\d{1,2}$/.test(value)) {
        // check for month-year...
        if (/^(\d{1,2})-(\d{4})$/.test(value)) {
            let found = value.match(/(\d{1,2})-(\d{4})/)
            value = `${found[2]}-${found[1]}`;
            inputElement.value = value;
        } else {
            validationError(inputElement, "Format should match YYYY-MM");
            return;
        }
    }

    // at this point, we should have a date in the form YYYY-MM...
    let selectedDate = new Date(value);
    if (isNaN(selectedDate.getTime())) {
        validationError(inputElement, "Invalid month or year");
        return;
    }
    let minDate = (inputElement.dataset.minDate) ? new Date(decodeURIComponent(inputElement.dataset.minDate)) : undefined
    let maxDate = (inputElement.dataset.maxDate) ? new Date(decodeURIComponent(inputElement.dataset.maxDate)) : undefined

    let before_min_date = minDate && selectedDate < minDate
    let after_max_date = maxDate && selectedDate > maxDate

    if (before_min_date) {
        validationError(inputElement, `Date must be after ${minDate.getUTCMonth() + 1}/${minDate.getUTCFullYear()}`)
    } else if (after_max_date) {
        validationError(inputElement, `Date must be before ${maxDate.getUTCMonth() + 1}/${maxDate.getUTCFullYear()}`)
    } else {
        clearValidationError(inputElement)
    }

}

function validate_date(inputElement) {
    console.log("in validate_date", inputElement)

    let minDate = (inputElement.dataset.minDate) ? new Date(inputElement.dataset.minDate + "GMT") : undefined
    let maxDate = (inputElement.dataset.maxDate) ? new Date(inputElement.dataset.maxDate + "GMT") : undefined
    let selectedDate = new Date(inputElement.value)

    /*
    console.log(
        "minDate:", minDate.toUTCString(),
        "\nmax Date:", maxDate.toUTCString(),
        "\ninput Date:", selectedDate.toUTCString()
    )*/

    let before_min_date = minDate && selectedDate < minDate
    let after_max_date = maxDate && selectedDate > maxDate

    if (before_min_date) {
        validationError(inputElement, `Date must be after ${minDate.getUTCMonth() + 1}/${minDate.getUTCDate()}/${minDate.getUTCFullYear()}`)
    } else if (after_max_date) {
        validationError(inputElement, `Date must be before ${maxDate.getUTCMonth() + 1}/${maxDate.getUTCDate()}/${maxDate.getUTCFullYear()}`)
    } else {
        clearValidationError(inputElement)
    }
}

function validate_email(inputElement) {
    console.log("in validate email", inputElement)

    let emailRegEx = /\S+@\S+\.\S+/;
    if (!emailRegEx.test(inputElement.value)) {
        validationError(inputElement, "Please enter an email address in this format: user@example.com.")
    } else {
        clearValidationError(inputElement)
    }
}

function validate_telephone(inputElement) {
    console.log("in validate telephone", inputElement)

    if (inputElement.value.length < 12) {
        validationError(inputElement, "Please enter a phone number in this format: 999-999-9999.")
    } else {
        clearValidationError(inputElement)
    }
}

function validate_text(inputElement) {
    console.log("in validate text")

    // validate a SSN...
    if (inputElement.classList.contains("SSN")) {
        // Remove dashes if they exist. Do not clean further (too permissive).
        const normalizedSSN = inputElement.value.replace(/^(\d{3})-?(\d{2})-?(\d{4})$/, '$1$2$3');
        if (!/^(?!9|000|666)[0-8]\d{2}(?!00)\d{2}(?!0000)\d{4}$/.test(normalizedSSN) ||
            ["078051120","219099999","111111111","333333333"].includes(normalizedSSN) ) {
            validationError(inputElement, "Please enter a valid Social Security Number in this format: 999-99-9999.")
            return
        } else {
            clearValidationError(inputElement)
        }
        // if you are a SSN, you cannot be a 4-digit SSN and the length is set...
    }

    // validate a 4 digit SSN
    if (inputElement.classList.contains("SSNsm")) {
        if (!/^(?!0000)\d{4}/.test(inputElement.value)) {
            validationError(inputElement, "Please enter the last four digits of a Social Security Number in this format: 9999.")
            return
        } else {
            clearValidationError(inputElement)
        }
    }

    // check string length of text response
    if ("minlen" in inputElement.dataset || "maxlen" in inputElement.dataset) {
        let textLen = inputElement.value.length;
        // the user has not entered anything.  Dont bark yet...
        if (textLen == 0){
            clearValidationError(inputElement)
            return
        }

        let hasMin = "minlen" in inputElement.dataset
        let hasMax = "maxlen" in inputElement.dataset
        let minLen = inputElement.dataset.minlen ?? -1
        let maxLen = inputElement.dataset.maxlen ?? -2
        let valueLen = inputElement.value.length

        if (minLen == maxLen && valueLen != minLen){
            let long_short = (valueLen < minLen)?"short":"long"
            validationError(inputElement, `Entered text is too ${long_short} (should have ${minLen} characters)`)
            return
        }

        if (hasMin && valueLen<minLen){
            validationError(inputElement, `Entered text is too short (should have at least ${minLen} characters)`)
            // if you are below the min length, you cannot be above the max length, so return...
            return
        }

        if (hasMax && valueLen>maxLen){
            validationError(inputElement, `Entered text is too long (should have at most ${maxLen} characters)`)
            return
        }
        clearValidationError(inputElement)
    }

    let checkConfirmation = "confirm" in inputElement.dataset ||
        "conformationFor" in inputElement.dataset
    if (checkConfirmation){
        let otherId = inputElement.dataset.confirm ?? inputElement.dataset.conformationFor
        let otherElement = document.getElementById(otherId)
        if (otherElement.value != inputElement.value){
            validationError(inputElement,"Values do not match")
            validationError(otherElement,"Values do not match")
        }else{
            clearValidationError(inputElement)
            clearValidationError(otherElement)
        }
    }
}

function validate_count(inputElement){
    console.log("in validate_count ... ")
    let hasMin = 'minCount' in inputElement.form?.dataset;
    let hasMax = 'maxCount' in inputElement.form?.dataset;
    // Only complain if true
    if (hasMin || hasMax){
        let minCount = inputElement.form.dataset.minCount
        let maxCount = inputElement.form.dataset.maxCount
        let selectedCount = inputElement.form.querySelectorAll(`[name=${inputElement.name}]:checked`).length
        let lastElement = inputElement.form.querySelectorAll(`[name=${inputElement.name}]`)
        lastElement=lastElement.item(lastElement.length-1).closest(".response")
        if (hasMin && selectedCount<minCount){
            validationError(lastElement, `You have selected ${selectedCount} items.  Please select at least ${minCount}.`)
        } else if (hasMax && selectedCount>maxCount){
            validationError(lastElement, `You have selected ${selectedCount} items.  Please select no more than ${maxCount}.`)
        } else {
            clearValidationError(lastElement)
        }

    }
}
