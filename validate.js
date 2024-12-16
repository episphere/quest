import { callExchangeValues, moduleParams } from "./questionnaire.js";
import { translate } from "./common.js";
import { math } from './customMathJSImplementation.js';

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
                validationError(inputElement, translate("validationInputEmptyField"));
            }
            return
        }

        handlers[inputElementType](inputElement)
    } else if (["radio", "time"].includes(inputElementType)) {
        // no validation for radio buttons or time selectors
    } else {
        moduleParams.errorLogger(`no handle for type: ${inputElementType}`, inputElement);
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
    if (inputElement && inputElement.nextElementSibling?.classList.contains('validation-container')) {
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

    callExchangeValues(inputElement);
    
    let belowMin =
        inputElement.dataset.min &&
        math.evaluate(`${inputElement.value} < ${inputElement.dataset.min}`);

    let aboveMax =
        inputElement.dataset.max &&
        math.evaluate(`${inputElement.value} > ${inputElement.dataset.max}`);

    if (belowMin) {
        validationError(inputElement, translate("validationNumberGreaterThan", [inputElement.dataset.min]));
    } else if (aboveMax) {
        validationError(inputElement, translate("validationNumberLessThan", [inputElement.dataset.max]));
    } else {
        clearValidationError(inputElement);
    }
}

function validate_month(inputElement) {

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
            validationError(inputElement, translate("validationMonthFormat"));
            return;
        }
    }

    // at this point, we should have a date in the form YYYY-MM...
    let selectedDate = new Date(value);
    if (isNaN(selectedDate.getTime())) {
        validationError(inputElement, translate("validationMonthInvalid"));
        return;
    }
    let minDate = (inputElement.dataset.minDate) ? new Date(decodeURIComponent(inputElement.dataset.minDate)) : undefined
    let maxDate = (inputElement.dataset.maxDate) ? new Date(decodeURIComponent(inputElement.dataset.maxDate)) : undefined

    let before_min_date = minDate && selectedDate < minDate
    let after_max_date = maxDate && selectedDate > maxDate

    // When input type='month' is supported, out of range values aren't selectable on the calendar.
    // validationError shows when type="month" is not supported. Match expected text input format.
    if (before_min_date) {
        validationError(inputElement, translate("validationMonthAfter", [minDate.getUTCFullYear(), (minDate.getUTCMonth() + 1).toString().padStart(2, '0')]));
    } else if (after_max_date) {
        validationError(inputElement, translate("validationMonthBefore", [maxDate.getUTCFullYear(), (maxDate.getUTCMonth() + 1).toString().padStart(2, '0')]));
    } else {
        clearValidationError(inputElement)
    }
}

function validate_date(inputElement) {

    let minDate = (inputElement.dataset.minDate) ? new Date(inputElement.dataset.minDate + "GMT") : undefined
    let maxDate = (inputElement.dataset.maxDate) ? new Date(inputElement.dataset.maxDate + "GMT") : undefined
    let selectedDate = new Date(inputElement.value)
    let before_min_date = minDate && selectedDate < minDate
    let after_max_date = maxDate && selectedDate > maxDate

    if (before_min_date) {
        validationError(inputElement, translate("validationDateAfter", [minDate.getUTCMonth() + 1, minDate.getUTCDate(), minDate.getUTCFullYear()]));
    } else if (after_max_date) {
        validationError(inputElement, translate("validationDateBefore", [maxDate.getUTCMonth() + 1, maxDate.getUTCDate(), maxDate.getUTCFullYear()]));
    } else {
        clearValidationError(inputElement);
    }
}

function validate_email(inputElement) {
    let emailRegEx = /\S+@\S+\.\S+/;
    if (!emailRegEx.test(inputElement.value)) {
        validationError(inputElement, translate("validationEmailAddress"));
    } else {
        clearValidationError(inputElement);
    }
}

function validate_telephone(inputElement) {
    if (inputElement.value.length < 12) {
        validationError(inputElement, translate("validationPhoneNumber"));
    } else {
        clearValidationError(inputElement);
    }
}

function validate_text(inputElement) {

    // validate a SSN...
    if (inputElement.classList.contains("SSN")) {
        if (!/^(?!9|000|666)(?!111-?11-?1111|333-?33-?3333|078-?05-?1120|219-?09-?9999)\d{3}-?(?!00)\d{2}-?(?!0000)\d{4}/gm.test(inputElement.value)) {
            validationError(inputElement, translate("validationSocialFull"));
            return;
        } else {
            clearValidationError(inputElement)
        }
        // if you are a SSN, you cannot be a 4-digit SSN and the length is set...
    }

    // validate a 4 digit SSN
    if (inputElement.classList.contains("SSNsm")) {
        if (!/^(?!0000)\d{4}/.test(inputElement.value)) {
            validationError(inputElement, translate("validationSocialPartial"));
            return;
        } else {
            clearValidationError(inputElement)
        }
    }

    // check string length of text response
    if ("minlen" in inputElement.dataset || "maxlen" in inputElement.dataset) {
        let textLen = inputElement.value.length;
        // the user has not entered anything.  Dont bark yet...
        if (textLen == 0){
            clearValidationError(inputElement);
            return;
        }

        let hasMin = "minlen" in inputElement.dataset
        let hasMax = "maxlen" in inputElement.dataset
        let minLen = inputElement.dataset.minlen ?? -1
        let maxLen = inputElement.dataset.maxlen ?? -2
        let valueLen = inputElement.value.length

        if (minLen == maxLen && valueLen != minLen){
            if (valueLen < minLen) {
                validationError(inputElement, translate("validationTextShortExact", [minLen]));
            }
            else {
                validationError(inputElement, translate("validationTextLongExact", [minLen]));
            }

            return;
        }

        if (hasMin && valueLen < minLen){
            validationError(inputElement, translate("validationTextShort", [minLen]));
            return;
        }

        if (hasMax && valueLen > maxLen){
            validationError(inputElement, translate("validationTextLong", [maxLen]));
            return
        }

        clearValidationError(inputElement)
    }

    let checkConfirmation = "confirm" in inputElement.dataset || "confirmationFor" in inputElement.dataset;
    
    if (checkConfirmation){
        console.warn('CONFIRMATION (CASE NOT FOUND/HANDLED YET)', checkConfirmation, inputElement);
        console.warn('INPUT ELEMENT DATASET', inputElement.dataset);
        let otherId = inputElement.dataset.confirm ?? inputElement.dataset.confirmationFor
        let otherElement = document.getElementById(otherId)

        console.warn('CONFIRMATION (CASE NOT FOUND/HANDLED YET) - other element', otherElement);

        if (otherElement.value != inputElement.value) {
            validationError(inputElement, translate("validationMismatch"));
            validationError(otherElement, translate("validationMismatch"));
        } else{
            clearValidationError(inputElement)
            clearValidationError(otherElement)
        }
    }
}

function validate_count(inputElement){
    let hasMin = inputElement.form?.dataset && 'minCount' in inputElement.form.dataset;
    let hasMax = inputElement.form?.dataset && 'maxCount' in inputElement.form.dataset;
    
    if (hasMin || hasMax){
        let minCount = inputElement.form.dataset.minCount;
        let maxCount = inputElement.form.dataset.maxCount;

        let selectedCount = inputElement.form.querySelectorAll(`[name=${inputElement.name}]:checked`).length;
        let lastElement = inputElement.form.querySelectorAll(`[name=${inputElement.name}]`);

        lastElement = lastElement.item(lastElement.length - 1).closest(".response");

        if (hasMin && selectedCount < minCount) {
            validationError(lastElement, translate("validationCountMore", [selectedCount, minCount]));
        } 
        else if (hasMax && selectedCount > maxCount) {
            validationError(lastElement, translate("validationCountLess", [selectedCount, maxCount]));
        } 
        else {
            clearValidationError(lastElement)
        }
    }
}
