for file in public/3d/*.glb; do
  echo "안전 압축 진행 중: $file"
  gltf-pipeline -i "$file" -o "${file%.glb}_tmp.glb" -d
  mv "${file%.glb}_tmp.glb" "$file"
done
