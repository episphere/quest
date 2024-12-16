import { moduleParams } from "./questionnaire.js";

export const translate = (key, replacements = []) => {
    
    let translation = moduleParams.i18n[key];

    replacements.forEach((value, index) => {
        translation = translation.replace(new RegExp(`\\{${index}\\}`, 'g'), value);
    });

    return translation;
}

export const ariaLiveAnnouncementRegions = () => {
    return `
        <div id="srAnnouncerContainer" class="visually-hidden">
            <div id="ariaLiveQuestionAnnouncer" aria-live="polite"></div>
            <div id="ariaLiveSelectionAnnouncer" aria-live="polite"></div>
        </div>
    `;
}

export const progressBar = () => {
    return moduleParams.showProgressBarInQuest ? `
        <div id="progressBarContainer" class="progress" style="margin-top:25px">
            <div id="progressBar" class="progress-bar" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                <span class="visually-hidden" id="progressBarText">0% Complete</span>
            </div>
        </div>
    ` : '';
}

export const responseRequestedModal = () => {

    return `
      <div class="modal" id="softModal" tabindex="-1" role="dialog" aria-labelledby="softModalTitle" aria-modal="true">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="softModalTitle" tabindex="-1">${translate('responseRequestedLabel')}</h5>
                      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close">
                      </button>
                  </div>
                  <div id="modalBody" class="modal-body" aria-describedby="modalBodyText">
                      <p id="modalBodyText"></p>
                  </div>
                  <div id="softModalFooter" class="modal-footer d-flex flex-column flex-sm-row justify-content-between align-items-center g-2">
                      <button type="button" id="modalContinueButton" class="btn btn-light" data-bs-dismiss="modal">${translate('continueWithoutAnsweringButton')}</button>
                      <button type="button" id="modalCloseButton" class="btn btn-light" data-bs-dismiss="modal">${translate('answerQuestionButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const responseRequiredModal = () => {
    
    return `
      <div class="modal" id="hardModal" tabindex="-1" role="dialog" aria-labelledby="hardModalLabel" aria-modal="true" aria-describedby="hardModalBodyText">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="hardModalLabel" tabindex="-1">${translate('responseRequiredLabel')}</h5>
                      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close">
                      </button>
                  </div>
                  <div class="modal-body">
                      <p id="hardModalBodyText"></p>
                  </div>
                  <div class="modal-footer">
                      <button type="button" class="btn btn-danger" data-bs-dismiss="modal">${translate('answerQuestionButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const responseErrorModal = () => {
    
    return `
      <div class="modal" id="softModalResponse" tabindex="-1" role="dialog" aria-labelledby="softModalResponseTitle" aria-modal="true" aria-describedby="softModalResponseBody">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="softModalResponseTitle" tabindex="-1">${translate('responseErrorLabel')}</h5>
                      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close">
                      </button>
                  </div>
                  <div id="modalResponseBody" class="modal-body">
                      <p>${translate('responseErrorBody')}</p>
                  </div>
                  <div id="softModalResponseFooter" class="modal-footer d-flex justify-content-between">
                      <button type="button" id=modalResponseContinueButton class="btn btn-success" data-bs-dismiss="modal">${translate('correctButton')}</button>
                      <button type="button" id=modalResponseCloseButton class="btn btn-danger" data-bs-dismiss="modal">${translate('incorrectButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}
  
export const submitModal = () => {

    return `
      <div class="modal" id="submitModal" tabindex="-1" role="dialog" aria-labelledby="submitModalTitle" aria-modal="true">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="submitModalTitle" tabindex="-1">${translate('submitLabel')}</h5>
                      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close">
                      </button>
                  </div>
                  <div id="submitModalBody" class="modal-body" aria-describedby="submitModalBodyText">
                      <p id="submitModalBodyText">${translate('submitBody')}</p>
                  </div>
                  <div class="modal-footer d-flex justify-content-between">
                      <button type="button" id="submitModalButton" class="btn btn-success" data-bs-dismiss="modal">${translate('submitButton')}</button>
                      <button type="button" id="cancelModalButton" class="btn btn-danger" data-bs-dismiss="modal">${translate('cancelButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}

export const storeErrorModal = () => {

    return `
      <div class="modal" id="storeErrorModal" tabindex="-1" role="dialog" aria-labelledby="storeErrorModalTitle" aria-modal="true" aria-describedby="storeErrorModalBody">
          <div class="modal-dialog" role="document">
              <div class="modal-content">
                  <div class="modal-header">
                      <h5 class="modal-title" id="storeErrorModalTitle" tabindex="-1">${translate('storeErrorLabel')}</h5>
                      <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Close">
                      </button>
                  </div>
                  <div id="modalResponseBody" class="modal-body">
                      <p>${translate('storeErrorBody')}</p>
                  </div>
                  <div id="storeErrorModalFooter" class="modal-footer text-center">
                      <button type="button" id="cancelModalButton" class="btn btn-danger mx-auto" data-bs-dismiss="modal">${translate('closeButton')}</button>
                  </div>
              </div>
          </div>
      </div>
    `;
}

export function showLoadingIndicator() {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loadingIndicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loadingIndicator);
}

export function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        document.body.removeChild(loadingIndicator);
    }
}