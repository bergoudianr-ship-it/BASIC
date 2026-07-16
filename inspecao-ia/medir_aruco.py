"""
Medição automática por foto usando marcador ArUco como escala.

Ideia (precisa): o marcador ArUco tem tamanho real conhecido (mm) e 4 cantos
detectados com subpixel. Calculamos uma homografia imagem->mm e medimos o
contorno da peça já em milímetros (isso corrige a perspectiva da foto).

Mede:
  - D  = diâmetro externo (círculo mínimo que envolve o contorno da peça)
  - d  = diâmetro do furo (se houver furo interno detectável)
  - W,H = largura/altura da caixa envolvente (peças não redondas)

Requisitos: opencv-python, numpy.
"""
import numpy as np
import cv2

DICIONARIO = cv2.aruco.DICT_4X4_50


def _detectar_marcador(gray):
    dic = cv2.aruco.getPredefinedDictionary(DICIONARIO)
    try:  # API nova (OpenCV >= 4.7)
        params = cv2.aruco.DetectorParameters()
        det = cv2.aruco.ArucoDetector(dic, params)
        corners, ids, _ = det.detectMarkers(gray)
    except AttributeError:  # API antiga
        params = cv2.aruco.DetectorParameters_create()
        corners, ids, _ = cv2.aruco.detectMarkers(gray, dic, parameters=params)
    return corners, ids


def _homografia_para_mm(marker_corners, marker_mm):
    """Homografia que leva pixels da imagem para coordenadas em mm."""
    src = marker_corners.reshape(4, 2).astype(np.float32)
    dst = np.array([[0, 0], [marker_mm, 0], [marker_mm, marker_mm], [0, marker_mm]],
                   dtype=np.float32)
    H, _ = cv2.findHomography(src, dst)
    return H


def _para_mm(pontos_px, H):
    pts = np.array(pontos_px, dtype=np.float32).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, H).reshape(-1, 2)


def _diametro_mm(contorno_px, H):
    pts_mm = _para_mm(contorno_px.reshape(-1, 2), H)
    (_, _), r = cv2.minEnclosingCircle(pts_mm.astype(np.float32))
    return 2 * r


def medir(image_bgr, marker_mm):
    """Retorna dict com medidas (mm) e imagem anotada (BGR)."""
    res = {"ok": False, "erro": None, "D": None, "d": None, "W": None, "H": None}
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    corners, ids = _detectar_marcador(gray)
    if ids is None or len(corners) == 0:
        res["erro"] = "Marcador ArUco não encontrado na foto."
        return res, image_bgr

    marker = corners[0]
    H = _homografia_para_mm(marker, marker_mm)

    # Apaga a área do marcador para não confundir com a peça
    mask = gray.copy()
    cv2.fillConvexPoly(mask, marker.reshape(4, 2).astype(np.int32), 255)

    # Binariza a peça (Otsu) e procura contornos
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    cv2.fillConvexPoly(th, marker.reshape(4, 2).astype(np.int32), 0)  # remove marcador
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    contornos, hier = cv2.findContours(th, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if not contornos:
        res["erro"] = "Não encontrei o contorno da peça (melhore o contraste/fundo)."
        return res, image_bgr

    # maior contorno externo = peça
    idx = max(range(len(contornos)), key=lambda i: cv2.contourArea(contornos[i]))
    peca = contornos[idx]

    annotated = image_bgr.copy()
    # diâmetro externo
    res["D"] = round(_diametro_mm(peca, H), 2)
    (cx, cy), rpx = cv2.minEnclosingCircle(peca)
    cv2.circle(annotated, (int(cx), int(cy)), int(rpx), (0, 200, 0), 3)
    cv2.putText(annotated, f"D={res['D']}mm", (int(cx - rpx), int(cy - rpx - 10)),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 200, 0), 2)

    # caixa envolvente (W x H)
    box_mm = _para_mm(peca.reshape(-1, 2), H)
    res["W"] = round(float(box_mm[:, 0].max() - box_mm[:, 0].min()), 2)
    res["H"] = round(float(box_mm[:, 1].max() - box_mm[:, 1].min()), 2)

    # furo interno (filho do contorno da peça na hierarquia)
    if hier is not None:
        hier = hier[0]
        filhos = [i for i in range(len(contornos))
                  if hier[i][3] == idx and cv2.contourArea(contornos[i]) > 0.02 * cv2.contourArea(peca)]
        if filhos:
            furo = max(filhos, key=lambda i: cv2.contourArea(contornos[i]))
            res["d"] = round(_diametro_mm(contornos[furo], H), 2)
            (fx, fy), frpx = cv2.minEnclosingCircle(contornos[furo])
            cv2.circle(annotated, (int(fx), int(fy)), int(frpx), (0, 140, 255), 3)
            cv2.putText(annotated, f"d={res['d']}mm", (int(fx - frpx), int(fy)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 140, 255), 2)

    res["ok"] = True
    return res, annotated
