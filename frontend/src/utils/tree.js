export function buildFileTree(paths) {
  const root = [];
  const map = {};

  const ensureDir = (segments, isFile = false) => {
    let current = root;
    let currentPath = '';
    segments.forEach((seg, idx) => {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      const isLast = idx === segments.length - 1;
      let node = map[currentPath];
      if (!node) {
        node = {
          title: seg,
          key: currentPath,
          isLeaf: isLast && isFile,
          children: isLast && isFile ? undefined : [],
        };
        map[currentPath] = node;
        current.push(node);
      }
      if (!isLast || !isFile) {
        if (!node.children) node.children = [];
        current = node.children;
      }
    });
  };

  (paths || []).forEach((p) => {
    if (typeof p === 'string') {
      const segs = p.split('/').filter(Boolean);
      if (segs.length === 0) return;
      ensureDir(segs, true);
    } else if (p && typeof p === 'object') {
      const pathStr = p.path || p.name || p.key;
      if (!pathStr) return;
      const segs = String(pathStr).split('/').filter(Boolean);
      ensureDir(segs, p.type !== 'directory' && p.isFile !== false);
    }
  });

  // sort: directories first
  const sortNodes = (nodes) => {
    if (!nodes) return;
    nodes.sort((a, b) => {
      const aDir = !a.isLeaf;
      const bDir = !b.isLeaf;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}