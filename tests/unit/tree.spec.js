import { describe, expect, it, vi } from 'vitest';
import { Tree } from '../../tree.js';

function buildBranchedTree() {
  const tree = new Tree();
  tree.add(['Q1', 'Q2', 'Q3']);
  tree.next();
  tree.add('Q1A');
  tree.next();
  tree.add('Q1B');
  tree.next();
  return tree;
}

describe('Tree', () => {
  it('starts empty at an iterable root node', () => {
    const tree = new Tree();

    expect(tree.isEmpty()).toBe(true);
    expect(tree.currentNode).toBe(tree.rootNode);
    expect(tree[Symbol.iterator]()).toBe(tree);
    expect(tree.next()).toEqual({ done: true, value: undefined });
    expect(tree.previous()).toEqual({ done: true, value: undefined });
    expect(tree.isFirst()).toBe(false);
  });

  it('adds scalar and array children while filtering false array entries', () => {
    const tree = new Tree();
    tree.add('Q1');
    tree.add(['Q2', null, '', 'Q3']);

    expect(tree.rootNode.children.map(({ value }) => value)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(tree.rootNode.children.every(({ parent }) => parent === tree.rootNode)).toBe(true);
  });

  it.each([null, undefined, '', false, 0])('rejects a false scalar value: %s', (value) => {
    expect(() => new Tree().add(value)).toThrow('adding a falsy value to the tree.');
  });

  it('rejects an array containing no usable values', () => {
    expect(() => new Tree().add([null, '', false])).toThrow('cannot add an empty or falsy array to the tree');
  });

  it('walks backward to the deepest previous sibling and clears abandoned descendants', () => {
    const tree = buildBranchedTree();
    tree.next();
    expect(tree.currentNode.value).toBe('Q2');

    const previous = tree.previous();
    expect(previous.value.value).toBe('Q1B');
    expect(tree.currentNode.children).toEqual([]);

    expect(tree.previous().value.value).toBe('Q1A');
    expect(tree.previous().value.value).toBe('Q1');
    expect(tree.isFirst()).toBe(true);
    expect(tree.previous()).toEqual({ done: true, value: undefined });
  });

  it('pops only leaf nodes and preserves nodes that still have children', () => {
    const tree = new Tree();
    tree.add(['Q1', 'Q2']);
    tree.next();
    tree.add('Q1A');

    tree.pop();
    expect(tree.currentNode.value).toBe('Q1');
    expect(tree.currentNode.children.map(({ value }) => value)).toEqual(['Q1A']);

    tree.next();
    tree.pop();
    expect(tree.currentNode.value).toBe('Q1');
    expect(tree.currentNode.children).toEqual([]);
  });

  it('clears all navigation state', () => {
    const tree = buildBranchedTree();
    tree.clear();

    expect(tree.isEmpty()).toBe(true);
    expect(tree.currentNode).toBe(tree.rootNode);
  });

  it('serializes, creates, and reloads the same tree shape and current node', () => {
    const tree = buildBranchedTree();
    const json = tree.toJSON();
    const created = Tree.fromJSON(json);

    expect(created.toJSON()).toBe(json);
    expect(created.currentNode.value).toBe('Q1B');

    const existing = new Tree();
    existing.add('discard-me');
    existing.loadFromJSON(json);
    expect(existing.toJSON()).toBe(json);
    expect(existing.currentNode.value).toBe('Q1B');
  });

  it('rejects malformed serialized input and invalid vanilla objects', () => {
    expect(() => Tree.fromJSON('{not-json')).toThrow();
    expect(() => new Tree().loadFromVanillaObject({ currentNode: null, rootNode: {} })).toThrow();

    const missingRootChildren = new Tree();
    missingRootChildren.rootNode.children = null;
    expect(() => missingRootChildren.loadFromVanillaObject({
      currentNode: null,
      rootNode: { children: [] },
    })).toThrow('children is null?');
  });

  it('returns terminal results for nodes outside the tree without mutating it', () => {
    const tree = new Tree();
    tree.add('Q1');
    const unknownNode = { value: 'UNKNOWN' };

    expect(tree.rootNode.lookForNext(unknownNode)).toEqual({ done: true, value: undefined });
    expect(tree.rootNode.lookForPreviousNode(unknownNode)).toEqual({ done: true, value: undefined });

    tree.rootNode.removeChild(unknownNode);
    expect(tree.rootNode.children.map(({ value }) => value)).toEqual(['Q1']);
  });

  it('reports the end of a root sequence and a completed nested branch', () => {
    const rootSequence = new Tree();
    rootSequence.add('Q1');
    expect(rootSequence.rootNode.lookForNext(rootSequence.rootNode.children[0]))
      .toEqual({ done: true, value: undefined });

    const nested = new Tree();
    nested.add('Q1');
    nested.next();
    nested.add('Q1A');
    nested.next();
    expect(nested.currentNode.next()).toEqual({ done: true, value: undefined });
  });

  it('creates an independent empty tree through a node iterator helper', () => {
    const tree = new Tree();
    tree.add('Q1');

    const iterator = tree.rootNode.iterator();
    expect(iterator).toBeInstanceOf(Tree);
    expect(iterator).not.toBe(tree);
    expect(iterator.isEmpty()).toBe(true);
  });

  it('coerces a supplied lookahead node value without mutating that node', () => {
    const nextNode = { value: 'Q1' };
    const receiver = { nextNode };

    expect(Tree.prototype.hasNext.call(receiver)).toBe(true);
    expect(nextNode).toEqual({ value: 'Q1' });

    nextNode.value = null;
    expect(Tree.prototype.hasNext.call(receiver)).toBe(false);
  });

  it('prints each traversable value and marks the current node', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const tree = buildBranchedTree();

    tree.printTree();

    expect(log.mock.calls.flat().join(' ')).toContain('Q1B');
    expect(log.mock.calls.flat().join(' ')).toContain('<=== currentNode');
  });

});
