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
      <input type="text" id="${this.id}Input" name="fname" value="${this.value}" maxlength="${(this.max + "").length}" size="1">
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
      label.value = this.value;
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
    this.input.value = "" + Math.round(newValue);

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

class TabInputs {
  constructor(container, id, tabs, delegate, hidden) {

    this.delegate = delegate;
    this.id = id;
    this.tabs = tabs;
    if (typeof container === 'string' || container instanceof String) {
      this.container = document.getElementById(container);
    } else {
      this.container = container;
    }

    this.hiddenValue = hidden;
    this.setupUI();
  }
  setupUI() {

    var elements = [];
    const subContainer = document.createElement('div');
    subContainer.className = "tabrow";
    subContainer.style.height = "35px";
    this.tabs.forEach((tab, i) => {
      const div = document.createElement('div');
      div.className = "tabrow-tab" + (tab.selected ?  " tabrow-tab-opened-accented" : "");
      div.id = "select" + this.id + i;
      div.title = tab.title;
      div.style = "line-height: 35px; display: block;" + (tab.image ? `background-image: url('./images/${tab.image}.png');` : "") + "background-size: 28px;";
      if (tab.value) {
        div.innerHTML = tab.value;
      }

      const captureThis = this;
      div.onclick = function() {
        captureThis.handleSelected(i);
      };

      subContainer.append(div);
      elements.push(div);
    });
    this.subContainer = subContainer;
    this.elements = elements;

    if (!this.hidden) {
      this.container.append(subContainer);
    }
  }

  handleSelected(index) {
    this.selected = index;
    this.delegate(this);
  }

  set selected(index) {
    this.selectedIndex = index;
    for (var i = 0; i < this.elements.length; ++i) {
      this.elements[i].className = i == index ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
    }
  }

  get selected() {
    return this.selectedIndex;
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
    this.container.append(this.subContainer);
  }

  hide() {
    this.hiddenValue = true;
    this.container.removeChild(this.subContainer);
  }
}

class MultiTabInputs extends TabInputs {
  setupIndexes() {
    this.selectedIndexes = [];
    this.tabs.forEach((tab, i) => {
      if (tab.selected) {
        this.selectedIndexes.push(i);
      }
    });

  }

  set selected(index) {

    if (!this.selectedIndexes) {
      this.setupIndexes();
    }

    const indexPosition = this.selectedIndexes.indexOf(index);
    if (indexPosition > -1) {
      this.selectedIndexes.splice(indexPosition, 1);
    } else {
      this.selectedIndexes.push(index);
    }

    for (var i = 0; i < this.elements.length; ++i) {
      this.elements[i].className = this.selectedIndexes.includes(i) ? "tabrow-tab tabrow-tab-opened-accented" : "tabrow-tab"
    }
  }

  get selected() {
    if (!this.selectedIndexes) {
      this.setupIndexes();
    }
    return this.selectedIndexes;
  }
}
