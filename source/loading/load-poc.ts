import {Box3, Vector3} from 'three';
import {PointAttributes, PointAttributeStringName} from '../point-attributes';
import {PointCloudOctreeGeometry} from '../point-cloud-octree-geometry';
import {PointCloudOctreeGeometryNode} from '../point-cloud-octree-geometry-node';
import {createChildAABB} from '../utils/bounds';
import {getIndexFromName} from '../utils/utils';
import {Version} from '../version';
import {BinaryLoader} from './binary-loader';
import {GetUrlFn, XhrRequest} from './types';

interface BoundingBoxData {
  lx: number;
  ly: number;
  lz: number;
  ux: number;
  uy: number;
  uz: number;
}

interface POCJson {
  version: string;
  octreeDir: string;
  projection: string;
  points: number;
  boundingBox: BoundingBoxData;
  tightBoundingBox?: BoundingBoxData;
  pointAttributes: PointAttributeStringName[];
  spacing: number;
  scale: number;
  hierarchyStepSize: number;
  hierarchy: [string, number][]; // [name, numPoints][]
}

/**
 * Loads a Point Cloud Octree (POC) from a given URL.
 * 
 * @param url - The url of the point cloud file (usually cloud.js).
 * @param getUrl - Function which receives the relative URL of a point cloud chunk file which is to be loaded and shoud return a new url (e.g. signed) in the form of a string or a promise.
 * @param xhrRequest - An arrow function for a fetch request
 * @returns An observable which emits once when the first LOD of the point cloud is loaded.
 */
export function loadPOC(
	url: string,
	getUrl: GetUrlFn,
	xhrRequest: XhrRequest,
): Promise<PointCloudOctreeGeometry> 
{
	return Promise.resolve(getUrl(url)).then((transformedUrl) => 
	{ // 1. Make a request to the URL
		return xhrRequest(transformedUrl, {mode: 'cors'})
			.then((res) => {return res.json();})
			.then(parse(transformedUrl, getUrl, xhrRequest)); // 2. Parse the response
	});
}

function parse(url: string, getUrl: GetUrlFn, xhrRequest: XhrRequest) 
{
	return (data: POCJson): Promise<PointCloudOctreeGeometry> => 
	{ // Note: The response gets passed from loadPOC()
		const {offset, boundingBox, tightBoundingBox} = getBoundingBoxes(data);
		const loader = new BinaryLoader({
			getUrl: getUrl,
			version: data.version,
			boundingBox: boundingBox,
			scale: data.scale,
			xhrRequest: xhrRequest
		}); // 3. Create a BinaryLoader with the bounding box and scale

		const pco = new PointCloudOctreeGeometry(
			loader,
			boundingBox,
			tightBoundingBox,
			offset,
			xhrRequest,
		); // 4. Create a PointCloudOctreeGeometry

		// 5. Fill in Geometry with the data from the POCJson
		pco.url = url;
		pco.octreeDir = data.octreeDir;
		pco.needsUpdate = true;
		pco.spacing = data.spacing;
		pco.hierarchyStepSize = data.hierarchyStepSize;
		pco.projection = data.projection;
		pco.offset = offset;
		pco.pointAttributes = new PointAttributes(data.pointAttributes);

		const nodes: Record<string, PointCloudOctreeGeometryNode> = {}; // HMM! Juicy! 6. Create a map of nodes

		const version = new Version(data.version);

		return loadRoot(pco, data, nodes, version).then(() => 
		{ // 7. Load the root node
			if (version.upTo('1.4')) 
			{
				loadRemainingHierarchy(pco, data, nodes);
			}

			pco.nodes = nodes;
			return pco;
		});
	};
}

function getBoundingBoxes(
	data: POCJson,
): { offset: Vector3; boundingBox: Box3; tightBoundingBox: Box3 } 
{
	const min = new Vector3(data.boundingBox.lx, data.boundingBox.ly, data.boundingBox.lz);
	const max = new Vector3(data.boundingBox.ux, data.boundingBox.uy, data.boundingBox.uz);
	const boundingBox = new Box3(min, max);
	const tightBoundingBox = boundingBox.clone();

	const offset = min.clone();

	if (data.tightBoundingBox) 
	{
		const {lx, ly, lz, ux, uy, uz} = data.tightBoundingBox;
		tightBoundingBox.min.set(lx, ly, lz);
		tightBoundingBox.max.set(ux, uy, uz);
	}

	boundingBox.min.sub(offset);
	boundingBox.max.sub(offset);
	tightBoundingBox.min.sub(offset);
	tightBoundingBox.max.sub(offset);

	return {offset: offset, boundingBox: boundingBox, tightBoundingBox: tightBoundingBox};
}

function loadRoot(
	pco: PointCloudOctreeGeometry,
	data: POCJson,
	nodes: Record<string, PointCloudOctreeGeometryNode>,
	version: Version,
): Promise<void> 
{
	const name = 'r';

	const root = new PointCloudOctreeGeometryNode(name, pco, pco.boundingBox);
	root.hasChildren = true;
	root.spacing = pco.spacing; // Fill in root info from the POCJson

	if (version.upTo('1.5')) 
	{
		root.numPoints = data.hierarchy[0][1];
	}
	else 
	{
		root.numPoints = 0;
	}

	pco.root = root;
	nodes[name] = root;
	return pco.root.load();
}

function loadRemainingHierarchy(
	pco: PointCloudOctreeGeometry,
	data: POCJson,
	nodes: Record<string, PointCloudOctreeGeometryNode>,
): void 
{
	for (let i = 1; i < data.hierarchy.length; i++) 
	{
		const [name, numPoints] = data.hierarchy[i];
		const {index, parentName, level} = parseName(name);
		const parentNode = nodes[parentName];

		const boundingBox = createChildAABB(parentNode.boundingBox, index);
		const node = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
		node.level = level;
		node.numPoints = numPoints;
		node.spacing = pco.spacing / Math.pow(2, node.level);

		nodes[name] = node;
		parentNode.addChild(node);
	}
}

function parseName(name: string): { index: number; parentName: string; level: number } 
{
	return {
		index: getIndexFromName(name),
		parentName: name.substring(0, name.length - 1),
		level: name.length - 1
	};
}
