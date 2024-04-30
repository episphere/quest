import { moduleParams } from "./questionnaire.js";

export const translate = (key, replacements = []) => {
    
    let translation = moduleParams.i18n[key];

    replacements.forEach((value, index) => {
        translation = translation.replace(new RegExp(`\\{${index}\\}`, 'g'), value);
    });

    return translation;
}

export const responseRequestedModal = () => {

    return `
      <div class="modal" id="softModal" tabindex="-1" role="dialog">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title">${translate('responseRequestedLabel')}</h5>
                      <button type="button" class="close" data-dismiss="modal" data-bs-dismiss="modal" aria-label="${translate('ariaCloseLabel')}">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div id="modalBody" class="modal-body">
                      <p id="modalBodyText"></p>
                  </div>
                  <div id="softModalFooter" class="modal-footer">
                      <button type="button" id=modalContinueButton class="btn btn-light" data-dismiss="modal" data-bs-dismiss="modal">${translate('continueWithoutAnsweringButton')}</button>
                      <button type="button" id=modalCloseButton class="btn btn-light" data-dismiss="modal" data-bs-dismiss="modal">${translate('answerQuestionButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const responseRequiredModal = () => {
    
    return `
      <div class="modal" id="hardModal" tabindex="-1" role="dialog">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title">${translate('responseRequiredLabel')}</h5>
                      <button type="button" class="close" data-dismiss="modal" data-bs-dismiss="modal" aria-label="${translate('ariaCloseLabel')}">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body">
                      <p id="hardModalBodyText"></p>
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn btn-danger" data-dismiss="modal" data-bs-dismiss="modal">${translate('answerQuestionButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const responseErrorModal = () => {
    
    return `
      <div class="modal" id="softModalResponse" tabindex="-1" role="dialog">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title">${translate('responseErrorLabel')}</h5>
                      <button type="button" class="close" data-dismiss="modal" aria-label="${translate('ariaCloseLabel')}">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div id="modalResponseBody" class="modal-body">
                      <p>${translate('responseErrorBody')}</p>
                  </div>
                  <div id="softModalResponseFooter" class="modal-footer">
                      <button type="button" id=modalResponseContinueButton class="btn btn-success" data-dismiss="modal">${translate('correctButton')}</button>
                      <button type="button" id=modalResponseCloseButton class="btn btn-danger" data-dismiss="modal">${translate('incorrectButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const submitModal = () => {
    
    return `
      <div class="modal" id="submitModal" tabindex="-1" role="dialog">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title">${translate('submitLabel')}</h5>
                      <button type="button" class="close" data-dismiss="modal" data-bs-dismiss="modal" aria-label="${translate('ariaCloseLabel')}">
                          <span aria-hidden="true">&times;</span>
                      </button>
                  </div>
                  <div class="modal-body">
                      <p id="submitModalBodyText">${translate('submitBody')}</p>
                  </div>
                  <div class="modal-footer">
                      <button type="button" id="submitModalButton" class="btn btn-success" data-dismiss="modal" data-bs-dismiss="modal">${translate('submitButton')}</button>
                      <button type="button" id="cancelModal" class="btn btn-danger" data-dismiss="modal" data-bs-dismiss="modal">${translate('cancelButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}