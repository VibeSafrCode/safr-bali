export type ReferralNode = { id: number; label: string; has_registered_services?: boolean };
export type ReferralEdge = { id: number; parent_id: number; child_id: number; source?: string };
export type ReferralData = { nodes: ReferralNode[]; edges: ReferralEdge[]; total_edges: number; truncated: boolean; root_user_id?: number };
export type MapNode = { key: string; id?: number; label: string; x: number; y: number; root?: boolean; has_registered_services?: boolean; members?: ReferralNode[] };

// Build a display-only spanning forest. Source attribution is never changed.
export function radialReferralLayout(data: ReferralData) {
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const children = new Map<number, number[]>();
  const incoming = new Set<number>();
  for (const e of data.edges) {
    if (!byId.has(e.parent_id) || !byId.has(e.child_id)) continue;
    const list = children.get(e.parent_id) ?? [];
    if (!list.includes(e.child_id)) list.push(e.child_id);
    children.set(e.parent_id, list); incoming.add(e.child_id);
  }
  const roots = data.nodes.filter(n => !incoming.has(n.id));
  const primary = (data.root_user_id ? byId.get(data.root_user_id) : undefined) ?? roots[0] ?? data.nodes[0];
  const nodes: MapNode[] = [];
  const edges: { from: string; to: string }[] = [];
  const visited = new Set<number>();
  const place = (id: number, angle: number, spread: number, depth: number, root = false) => {
    if (visited.has(id)) return;
    visited.add(id);
    const radius = depth * 240;
    nodes.push({key:String(id),id,label:byId.get(id)!.label,has_registered_services:byId.get(id)!.has_registered_services,x:root ? 0 : Math.cos(angle)*radius,y:root ? 0 : Math.sin(angle)*radius,root});
    const next = (children.get(id) ?? []).filter(child => !visited.has(child));
    next.forEach((child,i) => {
      if (visited.has(child)) return;
      const childAngle = angle + (i-(next.length-1)/2)*Math.min(.5,spread/Math.max(next.length,1));
      edges.push({from:String(id),to:String(child)});
      place(child,childAngle,spread/Math.max(next.length,1),depth+1);
    });
  };
  if (primary) {
    nodes.push({key:String(primary.id),id:primary.id,label:primary.label,has_registered_services:primary.has_registered_services,x:0,y:0,root:true}); visited.add(primary.id);
    const direct = children.get(primary.id) ?? [];
    const singles = direct.filter(id => !(children.get(id)?.length));
    const branches = direct.filter(id => children.get(id)?.length);
    // Keep every disconnected/cyclic component visible without inventing attribution.
    const extraRoots = roots.filter(n=>n.id!==primary.id).map(n=>n.id);
    const rays = branches.length + extraRoots.length + (singles.length ? 1 : 0);
    [...branches,...extraRoots].forEach((id,i) => {
      const angle = -Math.PI/4 + i*2*Math.PI/Math.max(rays,1);
      if (branches.includes(id)) edges.push({from:String(primary.id),to:String(id)});
      place(id,angle,2*Math.PI/Math.max(rays,1),1);
    });
    if (singles.length) {
      const angle=-Math.PI/4+(rays-1)*2*Math.PI/Math.max(rays,1);
      nodes.push({key:'singletons',label:'',x:Math.cos(angle)*240,y:Math.sin(angle)*240,members:singles.map(id=>byId.get(id)!)});
      edges.push({from:String(primary.id),to:'singletons'});singles.forEach(id=>visited.add(id));
    }
    data.nodes.forEach(n=>{if(!visited.has(n.id)) place(n.id,Math.PI/4,Math.PI/2,Math.ceil(nodes.length/8)+1);});
  }
  // Leave at least one card diagonal between centers, even on dense rings.
  const rings = new Map<number, MapNode[]>();
  for (const node of nodes) if (!node.root) {
    const depth = Math.round(Math.hypot(node.x,node.y)/240);
    rings.set(depth,[...(rings.get(depth) ?? []),node]);
  }
  let previousRadius=0;
  for (const [depth,ring] of [...rings].sort(([a],[b])=>a-b)) {
    const angles=ring.map(node=>({node,angle:Math.atan2(node.y,node.x)})).sort((a,b)=>a.angle-b.angle);
    const gaps=angles.map((entry,i)=>(angles[(i+1)%angles.length].angle-entry.angle+Math.PI*2)%(Math.PI*2));
    const minGap=angles.length<2?Math.PI*2:Math.min(...gaps);
    if(minGap<.001) angles.forEach((entry,i)=>entry.angle=-Math.PI/4+i*Math.PI*2/angles.length);
    const spacing=angles.length<2?0:230/(2*Math.sin((minGap<.001?Math.PI*2/angles.length:minGap)/2));
    const radius=Math.max(depth*240,previousRadius+240,spacing);
    angles.forEach(({node,angle})=>{node.x=Math.cos(angle)*radius;node.y=Math.sin(angle)*radius;});previousRadius=radius;
  }
  const extentX=Math.max(330,...nodes.map(n=>Math.abs(n.x)+115));
  const extentY=Math.max(260,...nodes.map(n=>Math.abs(n.y)+52));
  return {nodes,edges,extentX,extentY};
}
