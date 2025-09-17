const strengthLevels = {
  0: 0,
  1: 0.0001,
  2: 0.001,
  3: 0.01,
  4: 0.1,
  5: 0.5
};

export default function layoutForce(strengthLevel = 2) {
  let nodes = [];
  let getTx = d => (d.homeX ?? d.x);   // default target x
  let getTy = d => (d.homeY ?? d.y);   // default target y
  let getStrength = d => strengthLevels[strengthLevel] ?? 0;

  function force(alpha) {
    const n = nodes.length;
    for (let i = 0; i < n; ++i) {
      const node = nodes[i];
      const tx = getTx(node, i, nodes);
      const ty = getTy(node, i, nodes);
      if (tx == null || ty == null) continue;

      // scale by alpha so it cools with the simulation
      const k = getStrength(node, i, nodes) * alpha;
      node.vx += (tx - node.x) * k;
      node.vy += (ty - node.y) * k;
    }
  }

  force.initialize = _nodes => {
    nodes = _nodes || [];
  };

  // getter/setters
  force.strengthLevel = _ => {
    if (_ == null) return strengthLevel;
    strengthLevel = +_;
    getStrength = d => strengthLevels[strengthLevel] ?? 0;
    return force;
  };

  // Set target accessors or constants:
  //   .target(xAccessorOrNumber, yAccessorOrNumber)
  force.target = (tx, ty) => {
    if (tx == null && ty == null) return [getTx, getTy];
    getTx = typeof tx === "function" ? tx : () => tx;
    getTy = typeof ty === "function" ? ty : () => ty;
    return force;
  };

  return force;
}
