import {IPointCloudTreeNode} from '../types';

/**
 * Check if running on browser or node.js.
 * 
 * @returns True if running on browser.
 */
export function isBrowser() {
	return typeof window !== 'undefined' && typeof document !== "undefined";
}

/**
 * Returns the index of the node in the hierarchy from its name.
 * 
 * @param name The name of the node.
 */
export function getIndexFromName(name: string) 
{
	return parseInt(name.charAt(name.length - 1), 10);
}

/**
 * When passed to `[].sort`, sorts the array by level and index: r, r0, r3, r4, r01, r07, r30, ...
 * 
 * @param a The first node.
 * @param b The second node.
 */
export function byLevelAndIndex(a: IPointCloudTreeNode, b: IPointCloudTreeNode) 
{
	const na = a.name;
	const nb = b.name;
	if (na.length !== nb.length) 
	{
		return na.length - nb.length;
	}
	else if (na < nb) 
	{
		return -1;
	}
	else if (na > nb) 
	{
		return 1;
	}
	else 
	{
		return 0;
	}
}
