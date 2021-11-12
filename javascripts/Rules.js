// square root of 3 over 2
const hex_factor = 0.8660254037844386;

const ci = [
  [1., 0.],
  [0.5, hex_factor],
  [-0.5, hex_factor],
  [-1., 0.],
  [-0.5, -hex_factor],
  [0.5, -hex_factor]];

const a = 2 * Math.PI / 6;
const r = 20;

const hex_circle = [
  [2*r+r*Math.cos(a), r*Math.sin(a)],
  [r+r*Math.cos(a), r*Math.sin(a)],
  [0, 2*r*Math.sin(a)],
  [-r-r*Math.cos(a), r*Math.sin(a)],
  [-r-r*Math.cos(a), -r*Math.sin(a)],
  [0, -2*r*Math.sin(a)],
  [r+r*Math.cos(a), r*Math.sin(a)]];

function pointInHex(vertx, verty, testx, testy) {
    var result = false;
    for (var i = 0, j = 5; i < 6; j = i++) {
      if ( ((verty[i]>testy) != (verty[j]>testy)) &&
     (testx < (vertx[j]-vertx[i]) * (testy-verty[i]) / (verty[j]-verty[i]) + vertx[i]) )
         result = !result;
    }
    return result;
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

class RuleBookUIController {
  constructor(rulebooksCount, delegate, rulebookHandler) {
    this.tableDiv = document.querySelector("div.rulebook");
    this.shown = false;
    this.delegate = delegate;
    this.rulebookHandler = rulebookHandler;
    this.rulebooksCount = rulebooksCount;
  }

  setupUI() {
    this.setupButton();
    this.createTable();
    this.appendRulebook(this.selectedBook);
  }

  updateUI() {
    this.createTable();
    this.appendRulebook(this.selectedBook);
  }

  setupButton() {
    var captureThis = this;
    var showButton = document.querySelector('#showRulebook');
    showButton.addEventListener('pointerdown', function() {
      if (captureThis.shown) {
        captureThis.tableDiv.style.display = "none";
      } else {
        captureThis.tableDiv.style.display = "block";
      }

      captureThis.shown = !captureThis.shown;
      showButton.value = captureThis.shown ? "Hide details" : "Show details";
    });
  }

  createTable() {
    while (this.tableDiv.firstChild) {
      this.tableDiv.removeChild(this.tableDiv.firstChild)
    }
    let table = document.createElement('table')
    table.className = 'rulebookTable'
    table.style = "display: block; height: 400px; overflow: auto;"

    let tableBody = document.createElement('tbody')
    tableBody.className = "table-Body"
    table.append(tableBody)
    this.tableDiv.append(table)
  }

  colorFromColission(prtcl) {
    var x = 0.0, y = 0.0;
    for (var i = 0; i < 6; i++) {
      if ((prtcl & (1 << i)) != 0) {
        x += ci[i][0];
        y += ci[i][1];
      }
    }
    function hsv2rgb(h,s,v)
    {
      let f= (n,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);
      return [f(5),f(3),f(1)];
    }
    return this.vectorAngleColor(hsv2rgb(0.5 + atan(y, x), 1, 1));
  }

  appendRulebook(book) {
    this.appendDescription(book)

    book.rules.forEach((item, i) => {
      this.appendRule(item);
    });

  }

  appendDescription(book) {
    const table = document.querySelector('.rulebookTable')

    let headerRow = document.createElement('tr')
    headerRow.className = 'tableBodyRow'

    let bookNameData = document.createElement('h1')
    bookNameData.innerText = book.name;
    bookNameData.style.marginTop = "5px";
    headerRow.append(bookNameData);

    table.append(headerRow);

    let tableBodyRow = document.createElement('tr')
    tableBodyRow.className = 'tableBodyRow'

    let nameData = document.createElement('td')
    nameData.innerText = "";

    const captureThis = this;
    let deleteButton = document.createElement('input')
    deleteButton.type = "button"
    deleteButton.value = "Delete book"
    deleteButton.disabled = this.rulebooksCount == 1;

    deleteButton.addEventListener('pointerdown', function() {
      captureThis.rulebookHandler(false);
    });

    let copyButton = document.createElement('input')
    copyButton.type = "button"
    copyButton.value = "Copy book"
    copyButton.disabled = this.rulebooksCount == 10;

    copyButton.addEventListener('pointerdown', function() {
      captureThis.rulebookHandler(true);
    });

    let addButton = document.createElement('input')
    addButton.type = "button"
    addButton.value = "Add an empty rule"

    addButton.addEventListener('pointerdown', function() {
      captureThis.addAnEmptyRule();
    });

    tableBodyRow.append(deleteButton, copyButton, addButton);
    table.append(tableBodyRow);
  }

  longest_array(arr) {
  var max = arr[0];
  arr.forEach((item, i) => {
    if (item.length > max.length) {
      max = item;
    }
  });
    return max;
}

    appendRule(rule) {
      const table = document.querySelector('.rulebookTable') // Find the table we created
      let tableBodyRow = document.createElement('tr') // Create the current table row
      tableBodyRow.className = 'tableBodyRow'

      let nameLabel = document.createElement('tb')
      nameLabel.innerHTML = "<b>" + rule.name + "</b>";
      nameLabel.style.display = "inline";

      let nameInput = document.createElement('input');
      nameInput.type = "text"
      nameInput.value = rule.name;
      nameInput.style.display = "none";

      nameInput.addEventListener('input', function() {
        rule.name = this.value;
        nameLabel.innerHTML = "<b>" + rule.name + "</b>";
      });

      // line-height: 35px; display: block; background-image: url('./images/circle.png'); background-size: 28px;

      let redactButton = document.createElement('input');
      redactButton.type = "button"
      redactButton.title = "Redact name"
      redactButton.className = "btn";
      redactButton.style.backgroundImage = "url('./images/redact.png')"
      // redactButton.style.lineHeight = 28;

      redactButton.addEventListener('pointerdown', function() {
        if (nameLabel.style.display == "inline") {
            nameInput.style.display = "inline"
            nameLabel.style.display = "none"
            this.style.backgroundImage = "url('./images/ok.png')"
        } else {
          nameInput.style.display = "none"
          nameLabel.style.display = "inline"
          this.style.backgroundImage = "url('./images/redact.png')"
        }
      });

      let copyButton = document.createElement('input')
      copyButton.type = "button"
      copyButton.value = "Copy rule"
      copyButton.style.display = "inline";

      const captureThis = this;
      copyButton.addEventListener('pointerdown', function() {
        captureThis.copyRule(rule);
      });

      let deleteButton = document.createElement('input')
      deleteButton.type = "button"
      deleteButton.value = "Delete"
      deleteButton.style.display = "inline";

      deleteButton.addEventListener('pointerdown', function() {
        captureThis.deleteRule(rule);
      });

      let tableBodyRow2 = document.createElement('tr') // Create the current table row
      tableBodyRow2.className = 'tableBodyRow'

      new ToggleInput(tableBodyRow2, "Enabled", "Is this rule take effect.", rule.enabled, function(toggle) {
        rule.enabled = toggle.checked;
        captureThis.delegate();
      });

      new ToggleInput(tableBodyRow2, "Symmetric", "Make rule symmetric on 6 axis.", rule.symmetric, function(toggle) {
        rule.symmetric = toggle.checked;
        captureThis.delegate();
      });

      new ToggleInput(tableBodyRow2, "Random", "State transition will be picked randomly.", rule.random, function(toggle) {
        rule.random = toggle.checked;
        captureThis.delegate();
      });


      tableBodyRow.append(nameInput, nameLabel, redactButton);
      table.append(tableBodyRow);

      tableBodyRow2.append(copyButton, deleteButton);
      table.append(tableBodyRow2);

      let tableBodyRow3 = document.createElement('tr') // Create the current table row
      tableBodyRow3.className = 'tableBodyRow'

      let hexGridCanvas = document.createElement('canvas');
      rule.hexGridCanvas = hexGridCanvas;

      let deleteColButton = document.createElement('input')
      deleteColButton.type = "button"
      deleteColButton.value = "-"

      deleteColButton.addEventListener('pointerdown', function() {
        captureThis.deleteRuleLastCollision(rule);
      });

      let addColButton = document.createElement('input')
      addColButton.type = "button"
      addColButton.value = "+"

      addColButton.addEventListener('pointerdown', function() {
        captureThis.addRuleEmptyCollision(rule);
      });

      let colButtonDiv = document.createElement('div');
      // colButtonDiv.append(deleteColButton, addColButton);

      tableBodyRow3.append(hexGridCanvas, deleteColButton, addColButton);
      table.append(tableBodyRow3);

      const changeHandlers = this.drawRule(rule);

      hexGridCanvas.addEventListener('pointerdown', function(e) {
        changeHandlers.forEach((handler, i) => {
          const result = handler(e.offsetX, e.offsetY);
          if (result != false) {
            let rule = result[0];
            rule.collisions[result[1]][result[2]] ^= 1 << result[3];
            captureThis.delegate();
            captureThis.drawRule(rule);
          }
        });


      });
    }

    drawRule(rule) {
      let hexGridCanvas = rule.hexGridCanvas;
      let ctx = hexGridCanvas.getContext('2d');
      hexGridCanvas.width = this.longest_array(rule.collisions).length * 125;
      hexGridCanvas.height = rule.collisions.length * 115;

      var x = 0, y = 0;
      var changeHandlers = [];

      rule.collisions.forEach((collision, collisionIndex) => {
        collision.forEach((set, setIndex) => {
          var oldy = y;

          for (var i = 0; i < 7; i++) {
            x += hex_circle[i][0];
            y += hex_circle[i][1];

            const vert = this.drawHexagon(ctx, x, y, (set & (1 << i)) != 0 ? "red" : "gray");
            const captureI = i;

            changeHandlers.push(function (eventX, eventY) {
              return pointInHex(vert[0], vert[1], eventX, eventY) ? [rule, collisionIndex, setIndex, captureI] : false;
            });
          }

          y = oldy;
          x += 80;
        });

        x = 0;
        y += 110;

      });
      return changeHandlers;
    }

    drawHexagon(ctx, x, y, color) {
      var vertx = [], verty = [];
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        const vx = x + r * Math.cos(a * i);
        const vy = y + r * Math.sin(a * i);

        ctx.lineTo(vx, vy);

        vertx.push(vx)
        verty.push(vy)
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = "black";
      ctx.stroke();

      return [vertx, verty];
    }

    // Modification actions
    addAnEmptyRule() {
      const newRule = new Rule("New rule", false, false, [[0]]);
      newRule.enabled = false;
      this.selectedBook.rules.splice(0, 0, newRule)
      this.updateUI();
      this.delegate();
    }

    copyRule(rule) {
      this.selectedBook.rules.splice(this.selectedBook.rules.indexOf(rule) + 1, 0, rule.copy());

      this.updateUI();
      this.delegate();
    }

    deleteRule(rule) {
      this.selectedBook.rules = this.selectedBook.rules.filter(item => item !== rule);

      this.updateUI();
      this.delegate();
    }

    deleteRuleLastCollision(rule) {
      rule.collisions[0].pop();

      this.updateUI();
      this.delegate();
    }

    addRuleEmptyCollision(rule) {
      rule.collisions[0].push(0);

      this.updateUI();
      this.delegate();
    }
}

class RuleBook {
  constructor(name, rules) {
    this.name = name;
    this.rules = rules;
  }

  copy() {
    var copyRules = [];
    this.rules.forEach((rule, i) => {
      copyRules.push(rule.copy());
    });
    return new RuleBook(this.name + " (copy)", copyRules);
  }

  //TODOL move this to shader
  colissionMap(disableRandom) {
    var result = new Uint8Array(256);
    for (var i = 0; i < 256; i++) {
      result[i] = i;
    }

    this.rules.forEach((rule, i) => {
      if (!rule.enabled) return;
      let collisionRules = rule.collisionRules();
      for (var i = 0; i < collisionRules.length; i++) {
        let slicee = collisionRules[i].slice();
        if (rule.random) {
          shuffleArray(slicee);
        }
        for (var j = 0; j < (rule.random ? slicee.length : slicee.length - 1); j++) {
          result[slicee[j]] = (j == slicee.length - 1) ? slicee[0] : slicee[j + 1];
        }
      }
    });
    return result;
  }

  equals(obj) {
    for (var i = 0; i < this.rules.length; i++) {
      if (!this.rules[i].equals(obj.rules[i])) {
        return false;
      }
    }
    return true;
  }
}

class Rule {
  constructor(name, symmetric, random, collisions, enabled=true) {
    this.name = name;
    this.symmetric = symmetric;
    this.random = random;
    this.collisions = [collisions];
    this.enabled = enabled
  }

  copy() {
    var copyCollisions = [];
    this.collisions[0].forEach((item, i) => {
      copyCollisions.push(item);
    });

    return new Rule(this.name + " (copy)", this.symmetric, this.random, copyCollisions);
  }

  collisionRules() {
    if (this.symmetric) {
      var result = [this.collisions[0].slice()];
      for (var i = 1; i < 6; i++) {
        var newColl = [];
        this.collisions[0].forEach((item, counter) => {
          var prtcl = 0;
          for (var j = 0; j < 6; j++) {
            if ((item & (1 << j)) != 0) {
              prtcl |= 1 << ((j+i) % 6);
            }
          }
          if ((item & (1 << 6)) != 0) {
            prtcl |= 1 << 6;
          }
          newColl.push(prtcl);
        });
        result.push(newColl);
      }
      return result;
    } else {
      return this.collisions;
    }
  }

  equals(obj) {
    return this.collisions[0].equals(obj.collisions[0]) && this.symmetric == obj.symmetric && this.random == obj.random && this.enabled == obj.enabled;
  }
}
