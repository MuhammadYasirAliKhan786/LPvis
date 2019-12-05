function arraysEqualityCheck(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;
  // we care about item order
  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getStyleGlobal(className_) {
  // returns style object of first style specification that entirely matches the className_ selector
  var styleSheets = document.styleSheets;
  for(var i = 0; i < document.styleSheets.length; i++){
    var classes = styleSheets[i].rules || styleSheets[i].cssRules;
    if (!classes)
      continue;
    for (var x = 0; x < classes.length; x++) {
      if (classes[x].selectorText == className_) {
        return classes[x].style;
      }
    }
  }
}
