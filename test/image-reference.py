# Makes test/image-reference.json: SciPy's and Python's answers for the image functions, on invented images.
# Run with SciPy installed: python3 test/image-reference.py test/image-reference.json
import colorsys, json, sys
import numpy as np, scipy, scipy.ndimage as nd
L=lambda a: np.asarray(a, dtype=float).tolist()  # rows of values
rows, cols = 7, 9
i, j = np.mgrid[0:rows, 0:cols]
M = (40 + 20*i + 13*j + 30*np.sin(i*1.7 + j*0.9)) % 256          # a gray image
R, G, B = M, (255 - M*0.8) % 256, (M*0.5 + 60*np.cos(j)) % 256    # a color one
K = np.array([[0, 1, 0], [1, -4, 1], [0, 2, 0.5]])
out = {'scipy': scipy.__version__, 'M': L(M), 'R': L(R), 'G': L(G), 'B': L(B), 'K': L(K)}
out['convolve2d'] = L(nd.convolve(M, K, mode='nearest'))
out['gaussian1'] = L(nd.gaussian_filter(M, 1, mode='nearest', truncate=4.0))
out['gaussian0.6'] = L(nd.gaussian_filter(M, 0.6, mode='nearest', truncate=4.0))
out['box3'] = L(nd.uniform_filter(M, 3, mode='nearest'))
out['median3'] = L(nd.median_filter(M, 3, mode='nearest'))
out['erode3'] = L(nd.grey_erosion(M, size=(3, 3), mode='nearest'))
out['dilate5'] = L(nd.grey_dilation(M, size=(5, 5), mode='nearest'))
out['sobel'] = L(np.hypot(nd.sobel(M, axis=0, mode='nearest'), nd.sobel(M, axis=1, mode='nearest')))
out['rotate30'] = L(nd.rotate(M, 30, reshape=False, order=1, mode='constant', cval=0))
out['rotate-75'] = L(nd.rotate(M, -75, reshape=False, order=1, mode='constant', cval=0))
out['rot90_1'] = L(np.rot90(M, 1)); out['rot90_3'] = L(np.rot90(M, 3))
out['flipud'] = L(np.flipud(M)); out['fliplr'] = L(np.fliplr(M))
out['gray'] = L(0.299*R + 0.587*G + 0.114*B)
hsv = np.array([[colorsys.rgb_to_hsv(R[a, b]/255, G[a, b]/255, B[a, b]/255) for b in range(cols)] for a in range(rows)])*255
out['H'], out['S'], out['V'] = L(hsv[..., 0]), L(hsv[..., 1]), L(hsv[..., 2])

def q(x, levels): return round(min(255, max(0, x))/255*(levels-1))*255/(levels-1)
def diffuse(img, levels, taps, div):
    w = img.astype(float).copy(); o = np.zeros_like(w)
    for a in range(w.shape[0]):
        for b in range(w.shape[1]):
            o[a, b] = q(w[a, b], levels); e = w[a, b] - o[a, b]
            for da, db, s in taps:
                if a+da < w.shape[0] and 0 <= b+db < w.shape[1]: w[a+da, b+db] += e*s/div
    return o
FS = [(0, 1, 7), (1, -1, 3), (1, 0, 5), (1, 1, 1)]
AT = [(0, 1, 1), (0, 2, 1), (1, -1, 1), (1, 0, 1), (1, 1, 1), (2, 0, 1)]
JJN = [(0, 1, 7), (0, 2, 5), (1, -2, 3), (1, -1, 5), (1, 0, 7), (1, 1, 5), (1, 2, 3), (2, -2, 1), (2, -1, 3), (2, 0, 5), (2, 1, 3), (2, 2, 1)]
# Python's round is half-to-even; the app's is half-up. The images avoid exact halves after scaling.
out['fs2'] = L(diffuse(M, 2, FS, 16)); out['fs4'] = L(diffuse(M, 4, FS, 16))
out['atkinson2'] = L(diffuse(M, 2, AT, 8)); out['jarvis3'] = L(diffuse(M, 3, JJN, 48))
json.dump(out, open(sys.argv[1], 'w'))
