/**
 * @fileoverview Is this email meant for this student?
 *
 * It counts when it is for the student's batch and branch, or says "all
 * branches", or is addressed to the student. When an email says nothing
 * about who it is for, it is kept: hiding a real drive is the worse mistake.
 */
var PdEligibility = (function () {
  'use strict';

  function foldSet(values) {
    var set = {};
    (values || []).forEach(function (v) {
      var f = PdText.fold(v);
      if (f) set[f] = true;
    });
    return set;
  }

  /**
   * @param {{degrees:Array<string>, branches:Array<string>, allBranches:boolean, batches:Array<number>}} target
   *     who the email says it is for
   * @param {{batch:number, branchAliases:Array<string>, degreeAliases:Array<string>}} me
   * @param {boolean} direct true when the email names or is sent only to the student
   * @return {{forMe:string, reason:string}} forMe is 'yes', 'no' or 'maybe'
   */
  function evaluate(target, me, direct) {
    if (direct) return { forMe: 'yes', reason: 'Addressed to you' };

    if (target.batches.length && me.batch && target.batches.indexOf(me.batch) === -1) {
      return { forMe: 'no', reason: 'For batch ' + target.batches.join(', ') };
    }

    // "B.Tech", "BTech" and "B Tech" are one degree: compare letters only.
    var myDegrees = {};
    (me.degreeAliases || []).forEach(function (d) {
      var letters = String(d).toUpperCase().replace(/[^A-Z]/g, '');
      if (letters) myDegrees[letters] = true;
    });
    if (target.degrees.length && Object.keys(myDegrees).length) {
      var degreeHit = target.degrees.some(function (d) { return myDegrees[String(d).toUpperCase().replace(/[^A-Z]/g, '')]; });
      if (!degreeHit) return { forMe: 'no', reason: 'For ' + target.degrees.join(', ') };
    }

    if (target.allBranches) return { forMe: 'yes', reason: 'All branches' };

    if (target.branches.length) {
      var mine = foldSet(me.branchAliases);
      if (!Object.keys(mine).length) return { forMe: 'maybe', reason: 'Add your branch in Settings' };
      var hit = target.branches.some(function (b) { return mine[PdText.fold(b)]; });
      return hit
        ? { forMe: 'yes', reason: 'Your branch' }
        : { forMe: 'no', reason: 'For ' + target.branches[0] };
    }

    if (target.batches.length) return { forMe: 'yes', reason: 'Your batch' };
    return { forMe: 'maybe', reason: 'Does not say who it is for' };
  }

  /** Merge what the subject and the body each say; the subject wins on conflicts. */
  function combine(a, b) {
    function union(x, y) {
      var out = (x || []).slice();
      (y || []).forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
      return out;
    }
    return {
      degrees: a.degrees.length ? a.degrees : b.degrees,
      branches: a.branches.length || a.allBranches ? a.branches : b.branches,
      allBranches: a.allBranches || (!a.branches.length && b.allBranches),
      batches: a.batches.length ? a.batches : union([], b.batches)
    };
  }

  /** Short text for the dashboard: "CS/IT, 2027" or "All branches, 2027". */
  function describe(target) {
    var parts = [];
    if (target.allBranches) parts.push('All branches');
    else if (target.branches.length) parts.push(target.branches[0]);
    if (target.batches.length) parts.push(target.batches.join('/'));
    return parts.join(', ');
  }

  return { evaluate: evaluate, combine: combine, describe: describe };
})();
