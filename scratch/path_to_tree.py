import sys

def build_tree(paths):
    tree = {}
    for path in paths:
        if not path: continue
        parts = path.split('\\')
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {}
            current = current[part]
    return tree

def print_tree(tree, indent=''):
    keys = sorted(tree.keys())
    for i, key in enumerate(keys):
        is_last = (i == len(keys) - 1)
        prefix = '+-- ' if is_last else '|-- '
        sys.stdout.buffer.write(f"{indent}{prefix}{key}\n".encode('utf-8'))
        new_indent = indent + ('    ' if is_last else '|   ')
        print_tree(tree[key], new_indent)

if __name__ == "__main__":
    # Filter out the root prefix to make relative paths
    root = "D:\\DEV\\conf-platform"
    paths = []
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        if line.startswith(root):
            rel = line[len(root):].lstrip('\\')
            if rel:
                paths.append(rel)
    
    tree = build_tree(paths)
    print_tree(tree)
