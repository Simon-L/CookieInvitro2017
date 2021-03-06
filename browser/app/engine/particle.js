
import * as THREE from 'three.js';
import { closestPowerOfTwo, lerp } from '../libs/misc';
import assets from './assets';
import ShaderPass from './shaderpass';
import parameters from './parameters';

export default class {
	constructor(attributes, mat, step, gpu) {
		this.gpu = gpu | false;
		step = step | 1;

		this.uniforms = {
			time: { value: 1.0 },
			show: { value: 1.0 },
			resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
			frameBuffer: { value: 0 },
			spawnTexture: { value: 0 },
			velocityTexture: { value: 0 },
			positionTexture: { value: 0 },
			colorTexture: { value: 0 },
			normalTexture: { value: 0 },
		};

		if (gpu) {
			assets.shaderMaterials.particle.uniforms = this.uniforms;
			assets.shaderMaterials.fire.uniforms = this.uniforms;
			assets.shaderMaterials.position.uniforms = this.uniforms;
			assets.shaderMaterials.velocity.uniforms = this.uniforms;
		}

		var positionArray = attributes.position.array;

		var colorArray;
		if (attributes.color) colorArray = attributes.color.array;
		else colorArray = getDefaultColorArray(positionArray.length);

		var normalArray = attributes.normal.array;

		var dimension = closestPowerOfTwo(Math.sqrt(positionArray.length / 3));

		this.geometry = createGeometryForParticles(positionArray, colorArray, normalArray, step);

		this.mesh = new THREE.Mesh(this.geometry, mat);

		this.positionTexture = createDataTextureForParticles(positionArray, 3);
		this.colorTexture = createDataTextureForParticles(colorArray, 3);
		this.normalTexture = createDataTextureForParticles(normalArray, 3);
		this.positionPass = new ShaderPass(assets.shaderMaterials.position, dimension, dimension, THREE.RGBAFormat, THREE.FloatType);
		this.velocityPass = new ShaderPass(assets.shaderMaterials.velocity, dimension, dimension, THREE.RGBAFormat, THREE.FloatType);

		this.parameterList = Object.keys(parameters.particle);
		for (var i = 0; i < this.parameterList.length; i++) {
			this.uniforms[this.parameterList[i]] = { value: 0 };
		}
	}

	update(elapsed) {
		this.uniforms.time.value = elapsed;
		if (this.gpu) {
			this.uniforms.spawnTexture.value = this.positionTexture;
			this.uniforms.colorTexture.value = this.colorTexture;
			this.uniforms.normalTexture.value = this.normalTexture;
			this.uniforms.positionTexture.value = this.positionPass.getTexture();
			this.uniforms.velocityTexture.value = this.velocityPass.getTexture();
			this.positionPass.update();
			this.velocityPass.update();
		}
		for (var i = 0; i < this.parameterList.length; i++) {
			var param = parameters.particle[this.parameterList[i]];
			param = lerp(param, parameters.particleHeat[this.parameterList[i]], parameters.global.blendHeat);
			this.uniforms[this.parameterList[i]].value = param;
		}
	}
}

function getDefaultColorArray (count)
{
	var array = [];
	for (var i = count - 1; i >= 0; i--) {
		array[i] = 1;
	}
	return array;
}

function createGeometryForParticles (positionArray, colorArray, normalArray, step)
{
	var geometry = new THREE.BufferGeometry();

	// variables
	var x, y, z, ia, ib, ic, u, v, nx, ny, nz;
	var indexVertex = 0, indexUV = 0, indexAnchor = 0;
	var dimension = closestPowerOfTwo(Math.sqrt(positionArray.length / 3));
	var count = positionArray.length / 3;
	var resolution = dimension*dimension;

	// attributes
	var vertices = new Float32Array(count * 3 * 3);
	var normals = new Float32Array(count * 3 * 3);
	var colors = new Float32Array(count * 3 * 3);
	var anchor = new Float32Array(count * 3 * 2);
	var texcoord = new Float32Array(count * 3 * 2);

	// triangles
	for (var triangleIndex = 0; triangleIndex + step - 1 < count; triangleIndex += step) {

		ia = triangleIndex*3;
		ib = triangleIndex*3+1;
		ic = triangleIndex*3+2;

		// uv is used to map vertex index to bitmap data
		u = (triangleIndex % dimension) / dimension;
		v = Math.floor(triangleIndex / dimension) / dimension;

		// positions and normals are on the same for the 3 points
		for (var tri = 0; tri < 3; ++tri)
		{
			vertices[indexVertex+0] =  positionArray[ia];
			vertices[indexVertex+1] =  positionArray[ib];
			vertices[indexVertex+2] =  positionArray[ic];

			normals[indexVertex+0] = normalArray[ia];
			normals[indexVertex+1] = normalArray[ib];
			normals[indexVertex+2] = normalArray[ic];

	    colors[indexVertex+0] = colorArray[ia];
	    colors[indexVertex+1] = colorArray[ib];
	    colors[indexVertex+2] = colorArray[ic];

			texcoord[indexUV+0] = u;
			texcoord[indexUV+1] = v;

	    indexVertex += 3;
	    indexUV += 2;
	  }

	 	// offset used to scale triangle in shader
		anchor[indexAnchor] = 0;
		anchor[indexAnchor+1] = 1;
		anchor[indexAnchor+2] = -1;
		anchor[indexAnchor+3] = -1;
		anchor[indexAnchor+4] = 1;
		anchor[indexAnchor+5] = -1;
		indexAnchor += 6;
	}

	geometry.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );
	geometry.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
	geometry.addAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );
	geometry.addAttribute( 'anchor', new THREE.BufferAttribute( anchor, 2 ) );
	geometry.addAttribute( 'texcoord', new THREE.BufferAttribute( texcoord, 2 ) );

	var min = -1000;
	var max = 1000;
	geometry.boundingBox = new THREE.Box3(new THREE.Vector3(min,min,min), new THREE.Vector3(max,max,max));
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), max);

	return geometry;
}

function createDataTextureForParticles (dataArray, itemSize)
{
	var ia, ib, ic;
	var dimension = closestPowerOfTwo(Math.sqrt(dataArray.length / itemSize));
	var count = dataArray.length / itemSize;
	var resolution = dimension*dimension;
	var array = new Float32Array(resolution * itemSize);

	for (var triangleIndex = 0; triangleIndex < count; triangleIndex++)
	{
		ia = triangleIndex*3;
		ib = triangleIndex*3+1;
		ic = triangleIndex*3+2;

		array[ia] = dataArray[ia];
		array[ib] = dataArray[ib];
		array[ic] = dataArray[ic];
	}

	var texture = new THREE.DataTexture(array, dimension, dimension, THREE.RGBFormat, THREE.FloatType);
	texture.needsUpdate = true;

	return texture;
}

