class SliderInput {
  constructor(container, name, title, min, value, max, delegate, unit, hidden) {
    this.name = name;
    this.unit = unit;
    this.delegate = delegate;
    if (typeof container === 'string' || container instanceof String) {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }
    this.title = title;
    this.min = min;
    this.value = value;
    this.max = max;

    this.id = this.name.camelize();
    this.hiddenValue = hidden;

    if (!hidden) {
      this.setupUI();
    }
  }

  setupUI() {
    const div = document.createElement('div');
    div.id = this.id + "Container";
    div.innerHTML = `<div>
      <label id="${this.id}Label" title="${this.title}">${this.name}: </label>
      <input type="text" id="${this.id}Input" name="fname" value="${this.value}" maxlength="3" size="1">
      ${this.unit ? `<label id="${this.id}Label">${this.unit}</label>` : ""}
    </div>
    <div><input type="range" id="${this.id}" min="${this.min}" max="${this.max}" value="${this.value}" step="1"></div>`;
    this.container.appendChild(div);

    const captureThis = this;
    var label = document.querySelector('#' + this.id);
    var input = document.querySelector("#" + this.id + "Input");
    label.addEventListener('input', function() {
      input.value = "" + this.value;
      captureThis.value = this.value;
      captureThis.delegate(captureThis);
    });
    input.addEventListener('input', function() {
      tresholdLabel.value = this.value;
      captureThis.value = this.value;
      captureThis.delegate(captureThis);
    });
    label.value = this.value;
    input.value = "" + this.value;

    this.label = label;
    this.input = input;
  }

  set hidden(val){

    this.hiddenValue = val;
    if (val) {
      this.hide();
    } else {
      this.show();
    }
  }

  get hidden(){
     return this.hiddenValue;
  }

  show() {
    this.hiddenValue = false;

    this.setupUI();
  }

  hide() {
    this.hiddenValue = true;

    const div = document.getElementById(this.id + "Container");
    if (div) {
      this.container.removeChild(div);
    }
  }

  setValue(newValue) {
    this.value = newValue;
    this.label.value = newValue;
    this.input.value = "" + newValue;

    this.delegate(this);
  }
}

class ToggleInput {
  constructor(container, title, description, checked, delegate, hidden) {
    this.name = title;
    this.delegate = delegate;
    if (typeof container === 'string' || container instanceof String) {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }
    this.title = title;
    this.checked = checked;

    this.id = this.name.camelize();
    if (!hidden) {
      this.setupUI();
    }
  }

  setupUI() {
    let toggleButton = document.createElement('div');
    toggleButton.className = "toggleButton";
    toggleButton.title = this.description;
    toggleButton.style.display = "inline";

    let switchLabel = document.createElement('label');
    switchLabel.className = "switch";
    toggleButton.append(switchLabel);

    let toggleLabel = document.createElement('label');
    toggleLabel.className = "toggleButtonLabel";
    toggleLabel.innerText = this.title;
    toggleButton.append(toggleLabel);

    let checkbox = document.createElement('input');
    checkbox.type = "checkbox";
    checkbox.id = this.id;
    checkbox.checked = this.checked;
    const captureThis = this;
    checkbox.addEventListener('input', function() {
      captureThis.checked = this.checked;
      captureThis.delegate(captureThis);
    });
    switchLabel.append(checkbox);

    let slider = document.createElement('span');
    slider.className = "slider round";
    switchLabel.append(slider);

    this.container.append(toggleButton);
  }
}
