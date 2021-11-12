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

// Cell direction
const NOTHING = 0, E=1<<0, SE=1<<1, SW=1<<2, W=1<<3, NW=1<<4, NE=1<<5, REST=1<<6, VACANT1=1<<7;
// Cell type
const PARTICKLE = 0, BOUNDARY=1<<0, GENERATOR=1<<1, SINK=1<<2;

// these are some possible collision classes to choose from:
// first four from Fig. 1.6 in [1], for FHP6
// i) "linear"
const pair_head_on = [E+W, NE+SW, NW+SE];

// ii) "triple"
const symmetric_3 = [E+NW+SW, W+NE+SE];

// iii) "lambda"
const two_plus_spectator = [E+SW+NE, E+SE+NW];

// iv) "dual-linear"
const four_particles = [NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW];

// next ones from Fig. 1.9 in [1], for FHP7
// ii) and iii) "triple" and "linear+rest"
const pair_head_on_plus_rest = [E+W+REST, NE+SW+REST, NW+SE+REST, E+NW+SW, W+NE+SE];

// iii) "linear+rest" (used in FHP-II)
const pair_head_on_plus_rest_no_triple = [E+W+REST, NE+SW+REST, NW+SE+REST];

// iv) and v) "fundamental+rest" and "jay"
const one_plus_rest = [E+REST, SE+NE];

// vi) and (vii) "lambda" and "jay+rest"
const two_plus_spectator_including_rest = [E+SW+NE, E+SE+NW, NE+SE+REST];

// viii) and ix) "dual-linear" and "dual-triple + rest"
const four_particles_including_rest_no_momentum = [NE+NW+SE+SW, E+W+SE+NW, E+W+NE+SW, E+NW+SW+REST, W+NE+SE+REST];

// "dual-triple + rest" (used in FHP-II)
const symmetric_3_plus_rest = [E+NW+SW+REST, W+NE+SE+REST];

// x) "dual-linear + rest"
const four_particles_plus_rest = [NE+NW+SE+SW+REST, E+W+SE+NW+REST, E+W+NE+SW+REST];

// xi) and xii) "dual-fundamental" and "dual-jay + rest"
const five_particles_including_rest_momentum_one = [NE+NW+W+SW+SE, E+W+NW+SW+REST];

// xiii) and xiv) "dual-lambda + rest" and "dual-jay"
const two_plus_spectator_plus_rest = [E+SW+NE+REST, E+SE+NW+REST, NE+SE+E+W];

const wall_colision = [E+BOUNDARY, W];


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

  loadBook(bookStruct) {
    var rules = [];
    bookStruct.rules.forEach((ruleStruct, i) => {
      rules.push(new Rule(ruleStruct.name,
                          ruleStruct.symmetric,
                          ruleStruct.random,
                          ruleStruct.collisions[0],
                          ruleStruct.enabled));
    });

    let rulebook = new RuleBook(bookStruct.name, rules);
    let rulebooksCount = this.rulebooks.length;
    for (var i = 0; i < rulebooksCount; i++) {
      if (rulebook.equals(this.rulebooks[i])) {
        this.selectBook(i);
        return;
      }
    }

    this.rulebooks.push(rulebook);
    this.selectBook(rulebooksCount);
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
