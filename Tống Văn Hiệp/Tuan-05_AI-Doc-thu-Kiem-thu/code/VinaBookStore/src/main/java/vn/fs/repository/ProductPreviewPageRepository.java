package vn.fs.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import vn.fs.entity.Product;
import vn.fs.entity.ProductPreviewPage;

@Repository
public interface ProductPreviewPageRepository extends JpaRepository<ProductPreviewPage, Long> {

	List<ProductPreviewPage> findByProductAndEnabledTrueOrderByPageOrderAsc(Product product);

	List<ProductPreviewPage> findByProductOrderByPageOrderAsc(Product product);

	long countByProduct(Product product);

	void deleteByProduct(Product product);
}
