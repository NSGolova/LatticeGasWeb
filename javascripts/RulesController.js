// We're following:
// [1] Wylie, 1990:       http://pages.cs.wisc.edu/~wylie/doc/PhD_thesis.pdf
// [2] Arai et al., 2007: http://www.fz-juelich.de/nic-series/volume38/arai.pdf
// (see also: [3] Wolf-Gladrow, 2000: http://epic.awi.de/Publications/Wol2000c.pdf)

// N.B. Interestingly, [2] and [3] seem to miss out several FHP collisions,
//  e.g. [2] has REST+NE+SE+W and NW+NE+SW+SE in different classes, likewise E+W+REST and NE+SE+W
//  (also in [2] the last transition in Fig. 6 is misprinted (mass conservation error) and again in
//   Procedure 3 in Fig. 7)
//  e.g. [3] misses NE+SE+W <-> E+W+REST

// A "collision class" [2] is a set of states that can be swapped at will, without
// affecting the mass or momentum of that node. For best results, a gas should be
// "collision-saturated" - it swaps everything that can be swapped.

// these are some possible collision classes to choose from:
// first four from Fig. 1.6 in [1], for FHP6
const E=1, SE=2, SW=4, W=8, NW=16, NE=32, REST=64, BOUNDARY=128;
const pair_head_on = [[E+W, NE+SW, NW+SE]]; // i) "linear"
const symmetric_3 = [[E+NW+SW, W+NE+SE]]; // ii) "triple"
const two_plus_spectator = [[E+SW+NE, E+SE+NW]]; // iii) "lambda"
const four_particles = [[NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW]]; // iv) "dual-linear"
// next ones from Fig. 1.9 in [1], for FHP7
const pair_head_on_plus_rest = // ii) and iii) "triple" and "linear+rest"
    [[E+W+REST, NE+SW+REST, NW+SE+REST, E+NW+SW, W+NE+SE]];
const pair_head_on_plus_rest_no_triple = // iii) "linear+rest" (used in FHP-II)
    [[E+W+REST, NE+SW+REST, NW+SE+REST]];
const one_plus_rest = [ // iv) and v) "fundamental+rest" and "jay"
    [E+REST, SE+NE]];
const two_plus_spectator_including_rest = [ // vi) and (vii) "lambda" and "jay+rest"
    [E+SW+NE, E+SE+NW, NE+SE+REST]];
const four_particles_including_rest_no_momentum = // viii) and ix) "dual-linear" and "dual-triple + rest"
    [[NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW, E+NW+SW+REST, W+NE+SE+REST]];
const symmetric_3_plus_rest = [[E+NW+SW+REST, W+NE+SE+REST]]; // "dual-triple + rest" (used in FHP-II)
const four_particles_plus_rest = [[NE+NW+SE+SW+REST, E+W+SE+NW+REST, E+W+NE+SW+REST]]; // x) "dual-linear + rest"
const five_particles_including_rest_momentum_one = [ // xi) and xii) "dual-fundamental" and "dual-jay + rest"
    [NE+NW+W+SW+SE, E+W+NW+SW+REST]];
const two_plus_spectator_plus_rest = [ // xiii) and xiv) "dual-lambda + rest" and "dual-jay"
    [E+SW+NE+REST, E+SE+NW+REST, NE+SE+E+W]];


class RulesController {
  constructor(delegate) {
    this.delegate = delegate;
    this.setupDefault();
  }

  setupUI() {
    const captureThis = this;
    this.uiController = new RuleBookUIController(this.rulebooks.length, this.delegate, function (copy) {
      if (copy) {
        captureThis.copySelectedRulebook();
      } else {
        captureThis.deleteSelectedRulebook();
      }
    });
    this.uiController.selectedBook = this.selectedBook;
    this.uiController.setupUI();

    this.pickerUI = new RulesPickerUI(this);
    this.pickerUI.setupUI();
  }

  setupDefault() {
    const fhp1 = new RuleBook("FHP I",
      [new Rule("pair_head_on", false, true, pair_head_on),
       new Rule("symmetric_3", false, true, symmetric_3)]);

    const fhp2 = new RuleBook("FHP II",
      [new Rule("pair_head_on", false, true, pair_head_on),
      new Rule("symmetric_3", false, true, symmetric_3),
      new Rule("pair_head_on_plus_rest_no_triple", false, true, pair_head_on_plus_rest_no_triple),
      new Rule("symmetric_3_plus_rest", false, true, symmetric_3_plus_rest),
      new Rule("one_plus_rest", true, true, one_plus_rest)]);

    const fhp3 = new RuleBook("FHP III",
      [new Rule("pair_head_on", false, true, pair_head_on),
       new Rule("pair_head_on_plus_rest", false, true, pair_head_on_plus_rest),
       new Rule("one_plus_rest", true, true, one_plus_rest),
       new Rule("two_plus_spectator_including_rest", true, true, two_plus_spectator_including_rest),
       new Rule("four_particles_including_rest_no_momentum", false, true, four_particles_including_rest_no_momentum),
       new Rule("four_particles_plus_rest", false, true, four_particles_plus_rest),
       new Rule("five_particles_including_rest_momentum_one", true, true, five_particles_including_rest_momentum_one),
       new Rule("two_plus_spectator_plus_rest", true, true, two_plus_spectator_plus_rest)]);


     const fhp6 = new RuleBook("FHP VI",
       [new Rule("pair_head_on", false, true, pair_head_on),
       new Rule("symmetric_3", false, true, symmetric_3),
       new Rule("two_plus_spectator", true, true, two_plus_spectator),
       new Rule("four_particles", false, true, four_particles)]);

      this.rulebooks = [fhp1, fhp2, fhp3, fhp6];
      this.selectedBook = fhp3;
  }

  selectBook(index) {
    this.selectedBook = this.rulebooks[index];
    this.setupUI();
    this.delegate();
  }

  addBook(book) {
    this.rulebooks.push(book);
  }

  copySelectedRulebook() {
    let newBook = this.selectedBook.copy();
    this.rulebooks.splice(this.rulebooks.indexOf(this.selectedBook) + 1, 0, newBook);
    this.selectedBook = newBook;
    this.setupUI();
    this.delegate();
  }

  deleteSelectedRulebook() {
    let deletedBookIndex = this.rulebooks.indexOf(this.selectedBook);
    this.rulebooks = this.rulebooks.filter(item => item !== this.selectedBook);
    this.selectedBook = this.rulebooks[deletedBookIndex == 0 ? 0 : deletedBookIndex - 1];

    this.setupUI();
    this.delegate();
  }
}

class RulesPickerUI {
  constructor(rulesController) {
    this.ruleDiv = document.querySelector("div.rulePicker");
    this.rulesController = rulesController;
  }

  setupUI() {
    while (this.ruleDiv.firstChild) {
      this.ruleDiv.removeChild(this.ruleDiv.firstChild) // Remove all children from scoreboard div (if any)
    }

    this.clickables = []

    const captureThis = this;

    this.rulesController.rulebooks.forEach((item, i) => {
      let clickable = document.createElement('div') // Create the table itself
      clickable.className = 'clickable';
      clickable.id = "setRule" + i;
      clickable.innerText = item.name;
      clickable.onclick = function(elem) {
          captureThis.setRule(elem, i);
        };

      if (item == this.rulesController.selectedBook) {
        clickable.style.color = "red";
      }
      this.clickables.push(clickable);
      this.ruleDiv.append(clickable);
    });
  }

  setRule(elem, id) {
    for (var i = 0; i < this.clickables.length; ++i) {
      this.clickables[i].style.color = i == id ? "red" : "gray"
    }
    this.rulesController.selectBook(id);
  }
}
