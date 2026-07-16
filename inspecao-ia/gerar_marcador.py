"""
Gera um marcador ArUco para imprimir e usar como referência de escala.

Uso:
    python gerar_marcador.py            # gera marcador id 0, 800px
    python gerar_marcador.py 0 1000     # id 0, 1000px

IMPORTANTE: depois de imprimir, MEÇA com paquímetro o lado preto do marcador
(em mm) e use esse valor no servidor/medição. A precisão da medição depende de
o tamanho informado bater com o impresso.
"""
import sys
import cv2

DICIONARIO = cv2.aruco.DICT_4X4_50


def gerar(marker_id=0, px=800, saida=None):
    dic = cv2.aruco.getPredefinedDictionary(DICIONARIO)
    # API nova (OpenCV >= 4.7) e fallback para a antiga
    if hasattr(cv2.aruco, "generateImageMarker"):
        img = cv2.aruco.generateImageMarker(dic, marker_id, px)
    else:
        img = cv2.aruco.drawMarker(dic, marker_id, px)
    saida = saida or f"marcador_aruco_id{marker_id}.png"
    cv2.imwrite(saida, img)
    print(f"Marcador salvo em '{saida}'.")
    print("Passos: 1) imprima em folha sem ajuste de escala;")
    print("        2) meça o lado preto impresso (mm) com paquímetro;")
    print("        3) informe esse valor como 'tamanho do marcador' na medição.")


if __name__ == "__main__":
    mid = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    px = int(sys.argv[2]) if len(sys.argv) > 2 else 800
    gerar(mid, px)
